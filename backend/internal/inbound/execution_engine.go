package inbound

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// insertPlanStepEvent records a per-step timeline entry without touching
// organization_documents.status — unlike markDocumentStatus, this is purely
// informational (feeds the frontend timeline with per-step context such as
// the SAP document number a step produced) and never drives the document's
// own state machine.
func insertPlanStepEvent(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, eventType string, metadata map[string]any) error {
	metaJSON, err := marshalEventMetadata(metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into organization_document_events (
			id, organization_id, organization_document_id, event_type, actor_type, metadata_json, occurred_at
		) values ($1,$2,$3,$4,'system',$5,$6)
	`, ids.New(), organizationID, documentID, eventType, metaJSON, time.Now().UTC())
	return err
}

type AdvanceStepInput struct {
	OrganizationID       uuid.UUID
	DocumentID           uuid.UUID
	StepID               uuid.UUID
	Action               string // "run" (default) | "skip"
	ManualDocumentNumber string // honored by POST_GOODS_RECEIPT/CREATE_SERVICE_ENTRY (legacy "register-migo" pattern)
	Reason               string // required when Action == "skip"
	ActorType            string // "user" | "worker"
	ActorID              string
}

// AdvanceStep runs (or skips) one execution plan step. It is the single
// entry point used both by the manual "advance" HTTP endpoint and by the
// worker for AUTO steps — execution_mode only decides who calls this, the
// logic that runs is identical either way.
func (s *Service) AdvanceStep(ctx context.Context, in AdvanceStepInput) (*PlanStep, error) {
	var result PlanStep
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		step, err := getPlanStep(ctx, tx, in.OrganizationID, in.StepID)
		if err != nil {
			return err
		}
		if step.OrganizationDocumentID != in.DocumentID {
			return domainerr.NotFound("step_not_found", "Step not found for this document")
		}

		if in.Action == "skip" {
			if strings.TrimSpace(in.Reason) == "" {
				return domainerr.Validation("invalid_advance", "reason is required to skip a step")
			}
			skipped, err := s.skipStep(ctx, tx, step, in)
			result = skipped
			return err
		}

		switch step.Status {
		case PlanStepStatusReady, PlanStepStatusAwaitingManual, PlanStepStatusFailed, PlanStepStatusActionRequired, PlanStepStatusRunning:
			// RUNNING is only reachable here via Worker.claimReadySteps, which
			// atomically claims READY/AUTO rows by flipping them to RUNNING
			// before calling AdvanceStep — accepting it lets the worker reuse
			// this same entry point instead of a parallel execution path.
		default:
			return domainerr.Conflict("step_not_advanceable", "Step is not in a state that can be advanced: "+step.Status)
		}
		if step.DependencyStepID != nil {
			dep, err := getPlanStep(ctx, tx, in.OrganizationID, *step.DependencyStepID)
			if err != nil {
				return err
			}
			if dep.Status != PlanStepStatusDone && dep.Status != PlanStepStatusSkipped {
				return domainerr.Conflict("dependency_not_satisfied", "The previous step has not completed yet")
			}
		}

		executed, err := s.runStep(ctx, tx, step, in.ManualDocumentNumber)
		if err != nil {
			return err
		}
		result = executed
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      in.ActorType,
			ActorID:        in.ActorID,
			Action:         "inbound.step.advance",
			ResourceType:   "organization_execution_plan_steps",
			ResourceID:     step.ID.String(),
			After:          executed,
		})
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) skipStep(ctx context.Context, tx pgx.Tx, step PlanStep, in AdvanceStepInput) (PlanStep, error) {
	now := time.Now().UTC()
	step.Status = PlanStepStatusSkipped
	step.FinishedAt = &now
	step.UpdatedAt = now
	if err := updatePlanStep(ctx, tx, step); err != nil {
		return step, err
	}
	if err := insertPlanStepEvent(ctx, tx, step.OrganizationID, step.OrganizationDocumentID, "fiscal.inbound.step_skipped.v1", map[string]any{
		"step_type": step.StepType,
		"reason":    in.Reason,
	}); err != nil {
		return step, err
	}
	if err := s.cascadeAfterStep(ctx, tx, step); err != nil {
		return step, err
	}
	return step, audit.Write(ctx, tx, audit.Event{
		OrganizationID: &in.OrganizationID,
		ActorType:      in.ActorType,
		ActorID:        in.ActorID,
		Action:         "inbound.step.skip",
		ResourceType:   "organization_execution_plan_steps",
		ResourceID:     step.ID.String(),
		Reason:         in.Reason,
		After:          step,
	})
}

// runStep executes the SAP call for one step. Business/SAP failures are not
// returned as Go errors — they are a valid recorded outcome (FAILED, with
// error_code/error_message_sanitized) — only unexpected infrastructure
// errors (database, programming errors) are returned to the caller.
func (s *Service) runStep(ctx context.Context, tx pgx.Tx, step PlanStep, manualDocNumber string) (PlanStep, error) {
	now := time.Now().UTC()
	step.Status = PlanStepStatusRunning
	step.StartedAt = &now
	step.UpdatedAt = now
	if err := updatePlanStep(ctx, tx, step); err != nil {
		return step, err
	}

	doc, err := s.fiscal.GetDocument(ctx, step.OrganizationID, step.OrganizationDocumentID)
	if err != nil {
		return step, err
	}
	companyID := doc.OrganizationCompanyID
	adapter, err := sap.Resolve(ctx, s.integrations, step.OrganizationID, &companyID)
	if err != nil {
		return s.failStep(ctx, tx, step, err)
	}

	scenarioID, err := getDocumentScenarioID(ctx, tx, step.OrganizationID, step.OrganizationDocumentID)
	if err != nil {
		return step, err
	}
	scenarioWithRule, err := s.GetScenario(ctx, step.OrganizationID, scenarioID)
	if err != nil {
		return step, err
	}

	items, err := listItems(ctx, tx, step.OrganizationID, step.OrganizationDocumentID)
	if err != nil {
		return step, err
	}

	vendorCode := ""
	if vm, err := latestMatch(ctx, tx, step.OrganizationID, step.OrganizationDocumentID, nil, MatchTypeVendor); err != nil {
		return step, err
	} else if vm != nil && vm.ResolvedValue != nil {
		vendorCode = *vm.ResolvedValue
	}

	var (
		response     map[string]any
		sapDocNumber string
		stepErr      error
	)
	switch step.StepType {
	case StepCreatePurchaseOrder:
		sapDocNumber, response, stepErr = s.execCreatePurchaseOrder(ctx, tx, adapter, scenarioWithRule.Scenario, vendorCode, items)
	case StepCreateInboundDelivery:
		sapDocNumber, response, stepErr = execCreateInboundDelivery(ctx, adapter, items)
	case StepPostGoodsReceipt:
		sapDocNumber, response, stepErr = execPostGoodsReceipt(ctx, adapter, scenarioWithRule.Rule, items, manualDocNumber)
	case StepCreateServiceEntry:
		sapDocNumber, response, stepErr = execCreateServiceEntry(ctx, adapter, items)
	case StepPostSupplierInvoice:
		sapDocNumber, response, stepErr = execPostSupplierInvoice(ctx, adapter, items)
	case StepPostAccountingDocument:
		sapDocNumber, response, stepErr = execPostAccountingDocument(ctx, adapter, step)
	default:
		stepErr = domainerr.Validation("unsupported_step_type", "unsupported step_type: "+step.StepType)
	}

	if stepErr != nil {
		return s.failStep(ctx, tx, step, stepErr)
	}

	respJSON, _ := json.Marshal(response)
	finishedAt := time.Now().UTC()
	step.Status = PlanStepStatusDone
	step.SAPDocumentNumber = nullEmptyStr(sapDocNumber)
	step.ResponsePayloadJSON = respJSON
	step.ErrorCode = nil
	step.ErrorMessageSanitized = nil
	step.FinishedAt = &finishedAt
	step.UpdatedAt = finishedAt
	if err := updatePlanStep(ctx, tx, step); err != nil {
		return step, err
	}
	if err := insertPlanStepEvent(ctx, tx, step.OrganizationID, step.OrganizationDocumentID, "fiscal.inbound.step_completed.v1", map[string]any{
		"step_type":           step.StepType,
		"mode":                step.Mode,
		"sap_document_number": sapDocNumber,
	}); err != nil {
		return step, err
	}
	if err := s.cascadeAfterStep(ctx, tx, step); err != nil {
		return step, err
	}
	return step, nil
}

func (s *Service) failStep(ctx context.Context, tx pgx.Tx, step PlanStep, err error) (PlanStep, error) {
	code, _ := sap.ClassifyError(err)
	if code == "" {
		code = "sap_error"
	}
	now := time.Now().UTC()
	msg := err.Error()
	step.Status = PlanStepStatusFailed
	step.ErrorCode = &code
	step.ErrorMessageSanitized = &msg
	step.FinishedAt = &now
	step.UpdatedAt = now
	if updErr := updatePlanStep(ctx, tx, step); updErr != nil {
		return step, updErr
	}
	if evtErr := insertPlanStepEvent(ctx, tx, step.OrganizationID, step.OrganizationDocumentID, "fiscal.inbound.step_failed.v1", map[string]any{
		"step_type":     step.StepType,
		"error_code":    code,
		"error_message": msg,
	}); evtErr != nil {
		return step, evtErr
	}
	return step, nil
}

// cascadeAfterStep advances the next step in sequence to READY/AWAITING_MANUAL
// once its dependency finished, or marks the plan (and the document)
// COMPLETED when this was the last one.
func (s *Service) cascadeAfterStep(ctx context.Context, tx pgx.Tx, step PlanStep) error {
	next, hasNext, err := nextPendingStep(ctx, tx, step.OrganizationID, step.ExecutionPlanID, step.Sequence)
	if err != nil {
		return err
	}
	if !hasNext {
		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `update organization_execution_plans set status = $3, updated_at = $4 where organization_id = $1 and id = $2`,
			step.OrganizationID, step.ExecutionPlanID, PlanStatusCompleted, now); err != nil {
			return err
		}
		return markDocumentStatus(ctx, tx, step.OrganizationID, step.OrganizationDocumentID, DocStatusCompleted, fiscal.ProcessingCompleted, "fiscal.inbound.completed.v1", nil)
	}
	if next.Mode == StepExecModeAuto {
		next.Status = PlanStepStatusReady
	} else {
		next.Status = PlanStepStatusAwaitingManual
	}
	next.UpdatedAt = time.Now().UTC()
	return updatePlanStep(ctx, tx, next)
}

func nextPendingStep(ctx context.Context, tx dbtx, organizationID, planID uuid.UUID, afterSequence int) (PlanStep, bool, error) {
	row := tx.QueryRow(ctx, `
		select id, organization_id, organization_execution_plan_id, organization_document_id, sequence, step_type,
		       mode, status, dependency_step_id, idempotency_key, request_payload_json, response_payload_json,
		       sap_document_number, error_code, error_message_sanitized, started_at, finished_at, created_at, updated_at
		from organization_execution_plan_steps
		where organization_id = $1 and organization_execution_plan_id = $2 and sequence > $3
		order by sequence limit 1
	`, organizationID, planID, afterSequence)
	step, err := scanPlanStep(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlanStep{}, false, nil
	}
	if err != nil {
		return PlanStep{}, false, err
	}
	return step, true, nil
}

func getPlanStep(ctx context.Context, tx dbtx, organizationID, stepID uuid.UUID) (PlanStep, error) {
	row := tx.QueryRow(ctx, `
		select id, organization_id, organization_execution_plan_id, organization_document_id, sequence, step_type,
		       mode, status, dependency_step_id, idempotency_key, request_payload_json, response_payload_json,
		       sap_document_number, error_code, error_message_sanitized, started_at, finished_at, created_at, updated_at
		from organization_execution_plan_steps
		where organization_id = $1 and id = $2
	`, organizationID, stepID)
	step, err := scanPlanStep(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlanStep{}, domainerr.NotFound("step_not_found", "Execution plan step not found")
	}
	return step, err
}

func updatePlanStep(ctx context.Context, tx dbtx, step PlanStep) error {
	_, err := tx.Exec(ctx, `
		update organization_execution_plan_steps set
			status = $3, request_payload_json = $4, response_payload_json = $5, sap_document_number = $6,
			error_code = $7, error_message_sanitized = $8, started_at = $9, finished_at = $10, updated_at = $11
		where organization_id = $1 and id = $2
	`, step.OrganizationID, step.ID, step.Status, step.RequestPayloadJSON, step.ResponsePayloadJSON, step.SAPDocumentNumber,
		step.ErrorCode, step.ErrorMessageSanitized, step.StartedAt, step.FinishedAt, step.UpdatedAt)
	return err
}

func latestMatch(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID, itemID *uuid.UUID, matchType string) (*Match, error) {
	var rows pgx.Rows
	var err error
	if itemID == nil {
		rows, err = tx.Query(ctx, `select `+matchColumns+` from organization_document_matches
			where organization_id = $1 and organization_document_id = $2 and organization_nfe_item_id is null and match_type = $3
			order by created_at desc limit 1`, organizationID, documentID, matchType)
	} else {
		rows, err = tx.Query(ctx, `select `+matchColumns+` from organization_document_matches
			where organization_id = $1 and organization_document_id = $2 and organization_nfe_item_id = $3 and match_type = $4
			order by created_at desc limit 1`, organizationID, documentID, *itemID, matchType)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, nil
	}
	var m Match
	if err := rows.Scan(&m.ID, &m.OrganizationID, &m.OrganizationDocumentID, &m.OrganizationNFeItemID,
		&m.MatchType, &m.SourceValue, &m.ResolvedValue, &m.Strategy, &m.Confidence, &m.Status, &m.CreatedAt); err != nil {
		return nil, err
	}
	return &m, nil
}

// getDocumentScenarioID reads organization_document_scenario_resolutions —
// recorded once, right when a scenario is resolved for a document
// (recordScenarioResolution, called from processDocument before matching
// even starts) — not derived from validation rows, which may never exist if
// the document never reaches the validation phase (e.g. SAP unreachable
// during vendor matching).
func getDocumentScenarioID(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := tx.QueryRow(ctx, `
		select organization_inbound_scenario_id from organization_document_scenario_resolutions
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, domainerr.NotFound("scenario_not_resolved", "No scenario was resolved for this document")
	}
	return id, err
}

// recordScenarioResolution persists which scenario a document resolved to,
// independent of how far matching/validation gets afterward — see migration
// 017's comment for why this exists as its own table instead of piggybacking
// on organization_document_validations.
func recordScenarioResolution(ctx context.Context, tx dbtx, organizationID, documentID, scenarioID uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		insert into organization_document_scenario_resolutions (organization_document_id, organization_id, organization_inbound_scenario_id)
		values ($1, $2, $3)
		on conflict (organization_document_id) do update set organization_inbound_scenario_id = excluded.organization_inbound_scenario_id, resolved_at = now()
	`, documentID, organizationID, scenarioID)
	return err
}

// --- per step-type SAP calls ---

func orderRefsFor(items []Item) []sap.OrderRef {
	refs := make([]sap.OrderRef, 0, len(items))
	for _, it := range items {
		if it.ResolvedPurchaseOrderNumber == nil {
			continue
		}
		refs = append(refs, sap.OrderRef{
			PurchaseOrderNumber: *it.ResolvedPurchaseOrderNumber,
			PurchaseOrderItem:   strVal(it.ResolvedPurchaseOrderItem),
			MaterialCode:        strVal(it.ResolvedMaterialCode),
			Quantity:            it.Quantity,
			UnitPrice:           it.UnitPrice,
		})
	}
	return refs
}

func (s *Service) execCreatePurchaseOrder(ctx context.Context, tx pgx.Tx, adapter sap.Adapter, scenario Scenario, vendorCode string, items []Item) (string, map[string]any, error) {
	var pending []Item
	for _, it := range items {
		if it.ResolvedPurchaseOrderNumber == nil {
			pending = append(pending, it)
		}
	}
	if len(pending) == 0 {
		return "", map[string]any{"note": "no items required purchase order creation"}, nil
	}

	sapItems := make([]sap.CreatePurchaseOrderItemInput, 0, len(pending))
	for _, it := range pending {
		sapItems = append(sapItems, sap.CreatePurchaseOrderItemInput{
			MaterialCode: strVal(it.ResolvedMaterialCode),
			Description:  strVal(it.Description),
			Quantity:     it.Quantity,
			Unit:         strVal(it.Unit),
			UnitPrice:    it.UnitPrice,
		})
	}
	result, err := adapter.CreatePurchaseOrder(ctx, sap.CreatePurchaseOrderInput{
		VendorCode:             vendorCode,
		PurchasingOrganization: strVal(scenario.PurchasingOrganization),
		Plant:                  strVal(scenario.Plant),
		Items:                  sapItems,
	})
	if err != nil {
		return "", nil, err
	}

	for i, it := range pending {
		lineItem := strconv.Itoa((i + 1) * 10)
		it.ResolvedPurchaseOrderNumber = nullEmptyStr(result.PurchaseOrderNumber)
		it.ResolvedPurchaseOrderItem = nullEmptyStr(lineItem)
		it.Status = ItemStatusMatched
		it.UpdatedAt = time.Now().UTC()
		if err := updateItemFields(ctx, tx, it); err != nil {
			return "", nil, err
		}
		if _, err := insertMatch(ctx, tx, Match{
			OrganizationID: it.OrganizationID, OrganizationDocumentID: it.OrganizationDocumentID, OrganizationNFeItemID: &it.ID,
			MatchType: MatchTypePurchaseOrder, ResolvedValue: nullEmptyStr(result.PurchaseOrderNumber),
			Strategy: nullEmptyStr("created"), Confidence: floatPtr(1), Status: MatchStatusMatched,
		}); err != nil {
			return "", nil, err
		}
	}
	return result.PurchaseOrderNumber, map[string]any{"purchase_order_number": result.PurchaseOrderNumber}, nil
}

func execCreateInboundDelivery(ctx context.Context, adapter sap.Adapter, items []Item) (string, map[string]any, error) {
	refs := orderRefsFor(items)
	if len(refs) == 0 {
		return "", nil, domainerr.Validation("no_purchase_order", "no item has a resolved purchase order to create a delivery for")
	}
	result, err := adapter.CreateInboundDelivery(ctx, sap.CreateInboundDeliveryInput{
		PurchaseOrderNumber: refs[0].PurchaseOrderNumber,
		Items:               refs,
	})
	if err != nil {
		return "", nil, err
	}
	return result.DeliveryNumber, map[string]any{"delivery_number": result.DeliveryNumber}, nil
}

func execPostGoodsReceipt(ctx context.Context, adapter sap.Adapter, rule ScenarioRule, items []Item, manualDocNumber string) (string, map[string]any, error) {
	refs := orderRefsFor(items)
	if len(refs) == 0 && manualDocNumber == "" {
		return "", nil, domainerr.Validation("no_purchase_order", "no item has a resolved purchase order to post a goods receipt for")
	}
	poNumber := ""
	if len(refs) > 0 {
		poNumber = refs[0].PurchaseOrderNumber
	}
	result, err := adapter.PostGoodsReceipt(ctx, sap.PostGoodsReceiptInput{
		PurchaseOrderNumber:  poNumber,
		MovementType:         rule.GoodsReceiptMovementType,
		Items:                refs,
		ManualDocumentNumber: manualDocNumber,
	})
	if err != nil {
		return "", nil, err
	}
	return result.MaterialDocumentNumber, map[string]any{"material_document_number": result.MaterialDocumentNumber}, nil
}

func execCreateServiceEntry(ctx context.Context, adapter sap.Adapter, items []Item) (string, map[string]any, error) {
	refs := orderRefsFor(items)
	if len(refs) == 0 {
		return "", nil, domainerr.Validation("no_purchase_order", "no item has a resolved purchase order for a service entry sheet")
	}
	result, err := adapter.CreateServiceEntry(ctx, sap.CreateServiceEntryInput{PurchaseOrderNumber: refs[0].PurchaseOrderNumber, Items: refs})
	if err != nil {
		return "", nil, err
	}
	return result.ServiceEntrySheetNumber, map[string]any{"service_entry_sheet_number": result.ServiceEntrySheetNumber}, nil
}

func execPostSupplierInvoice(ctx context.Context, adapter sap.Adapter, items []Item) (string, map[string]any, error) {
	refs := orderRefsFor(items)
	if len(refs) == 0 {
		return "", nil, domainerr.Validation("no_purchase_order", "no item has a resolved purchase order to invoice")
	}
	var gross float64
	for _, it := range items {
		gross += it.TotalAmount
	}
	result, err := adapter.PostSupplierInvoice(ctx, sap.PostSupplierInvoiceInput{
		PurchaseOrderNumber: refs[0].PurchaseOrderNumber,
		GrossAmount:         gross,
		Currency:            "BRL",
		Items:               refs,
	})
	if err != nil {
		return "", nil, err
	}
	return result.InvoiceDocumentNumber, map[string]any{
		"invoice_document_number":    result.InvoiceDocumentNumber,
		"accounting_document_number": result.AccountingDocumentNumber,
	}, nil
}

func execPostAccountingDocument(ctx context.Context, adapter sap.Adapter, step PlanStep) (string, map[string]any, error) {
	result, err := adapter.PostAccountingDocument(ctx, sap.PostAccountingDocumentInput{
		SourceDocumentNumber: step.OrganizationDocumentID.String(),
		SourceDocumentType:   "fiscal_document",
	})
	if err != nil {
		return "", nil, err
	}
	return result.AccountingDocumentNumber, map[string]any{"accounting_document_number": result.AccountingDocumentNumber}, nil
}
