package inbound

import (
	"context"
	"errors"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// nfeHeader is the subset of organization_nfe consulted for scenario
// resolution and vendor matching — read directly (fiscal.Service does not
// expose the extension), never written by this package.
type nfeHeader struct {
	AccessKey         string
	Series            string
	Number            string
	Model             string
	IssuerCNPJ        string
	RecipientDocument string
}

func getNFeHeader(ctx context.Context, tx pgx.Tx, documentID uuid.UUID) (nfeHeader, error) {
	var h nfeHeader
	var accessKey, series, number, model, issuerCNPJ, recipientDoc *string
	err := tx.QueryRow(ctx, `
		select access_key, series, number, model, issuer_cnpj, recipient_document
		from organization_nfe where organization_document_id = $1
	`, documentID).Scan(&accessKey, &series, &number, &model, &issuerCNPJ, &recipientDoc)
	if err != nil {
		return h, err
	}
	h.AccessKey, h.Series, h.Number, h.Model, h.IssuerCNPJ, h.RecipientDocument =
		strVal(accessKey), strVal(series), strVal(number), strVal(model), strVal(issuerCNPJ), strVal(recipientDoc)
	return h, nil
}

// IngestInbound runs the orchestrator's synchronous phase for a document
// just created by fiscal.Service.Receive with direction=inbound: extract
// items, resolve the scenario, run vendor/material/purchase-order matching
// and configured validations, then either flag the document for manual
// action/rejection or build the execution plan for the remaining SAP
// postings. Idempotent from the caller's perspective: safe to call again
// for the same document if it fails partway (e.g. worker retry after a
// process crash) — a second call re-derives everything from the current
// item/scenario state rather than assuming nothing ran before. Callers
// should still guard against calling it twice concurrently for the same
// document (not expected in the current HTTP-synchronous flow).
func (s *Service) IngestInbound(ctx context.Context, organizationID, companyID, documentID uuid.UUID, rawPayload []byte, contentType string) error {
	extracted, err := ExtractItems(rawPayload, contentType)
	if err != nil {
		return domainerr.Validation("invalid_payload", "Failed to extract line items: "+err.Error())
	}

	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		header, err := getNFeHeader(ctx, tx, documentID)
		if err != nil {
			return err
		}
		items, err := listItems(ctx, tx, organizationID, documentID)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			items, err = insertItems(ctx, tx, organizationID, documentID, extracted)
			if err != nil {
				return err
			}
		}
		return s.processDocument(ctx, tx, organizationID, companyID, documentID, header, items)
	})
}

// Reprocess re-runs matching/validation/plan-building for a document whose
// items were already corrected (PATCH item / override) after an earlier
// ACTION_REQUIRED outcome — the counterpart to IngestInbound when there is
// no new payload to extract, only already-persisted (and now corrected)
// items. Only allowed from ACTION_REQUIRED: a terminal document
// (COMPLETED/REJECTED/FAILED) must be handled through override/plan
// endpoints instead, and a document already mid-execution has nothing left
// for matching to decide.
func (s *Service) Reprocess(ctx context.Context, organizationID, documentID uuid.UUID) error {
	doc, err := s.fiscal.GetDocument(ctx, organizationID, documentID)
	if err != nil {
		return err
	}
	if doc.Status != DocStatusActionRequired {
		return domainerr.Conflict("document_not_reprocessable", "Only documents in ACTION_REQUIRED can be reprocessed, current status: "+doc.Status)
	}

	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		header, err := getNFeHeader(ctx, tx, documentID)
		if err != nil {
			return err
		}
		items, err := listItems(ctx, tx, organizationID, documentID)
		if err != nil {
			return err
		}
		return s.processDocument(ctx, tx, organizationID, doc.OrganizationCompanyID, documentID, header, items)
	})
}

func (s *Service) processDocument(ctx context.Context, tx pgx.Tx, organizationID, companyID, documentID uuid.UUID, header nfeHeader, items []Item) error {
	criteria := ScenarioCriteria{DocumentModel: header.Model, VendorCNPJ: header.IssuerCNPJ}
	if len(items) > 0 && items[0].CFOP != nil {
		criteria.CFOP = *items[0].CFOP
	}
	scenarioWithRule, err := resolveScenarioTx(ctx, tx, organizationID, companyID, criteria)
	if err != nil {
		var de *domainerr.Error
		if errors.As(err, &de) && de.Code == "scenario_not_found" {
			return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.scenario_not_found.v1", map[string]any{
				"document_model": criteria.DocumentModel,
				"vendor_cnpj":    criteria.VendorCNPJ,
				"cfop":           criteria.CFOP,
			})
		}
		return err
	}
	scenario := scenarioWithRule.Scenario
	rule := scenarioWithRule.Rule

	if err := recordScenarioResolution(ctx, tx, organizationID, documentID, scenario.ID); err != nil {
		return err
	}

	// Drop prior matching/validation rows and resolved_* fields so Reprocess
	// shows a fresh outcome (old NOT_FOUND rows were accumulating in the UI).
	if err := resetDocumentMatchingState(ctx, tx, organizationID, documentID); err != nil {
		return err
	}
	for i := range items {
		items[i].ResolvedMaterialCode = nil
		items[i].ResolvedPurchaseOrderNumber = nil
		items[i].ResolvedPurchaseOrderItem = nil
		items[i].Status = ItemStatusPending
	}

	companyIDCopy := companyID
	adapter, err := sap.Resolve(ctx, s.integrations, organizationID, &companyIDCopy)
	if err != nil {
		return err
	}

	vendorMatch, _, err := matchVendor(ctx, tx, adapter, organizationID, documentID, header.IssuerCNPJ)
	if err != nil {
		if _, ok := asAdapterFailure(err); ok {
			return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.sap_unavailable.v1", map[string]any{"step": "vendor"})
		}
		return err
	}
	if _, err := validateVendor(ctx, tx, organizationID, documentID, scenario.ID, rule, vendorMatch); err != nil {
		return err
	}

	reject := vendorMatch.Status != MatchStatusMatched && rule.VendorFailureAction == FailureActionReject
	actionRequired := vendorMatch.Status != MatchStatusMatched && rule.ValidateVendor && rule.VendorFailureAction != FailureActionPass && rule.VendorFailureAction != FailureActionReject
	needsPOCreation := false
	var rejectReason, actionRequiredReason string
	if reject {
		rejectReason = "Fornecedor não permitido (ação configurada: REJECT)"
	} else if actionRequired {
		actionRequiredReason = "Fornecedor não reconhecido — aguardando decisão manual"
	}

	// branchCnpj for the real Nexus CPI PurchaseOrders iFlow = receiving company
	// (NFe dest). Prefer company master; fall back to XML recipient document.
	branchCNPJ := header.RecipientDocument
	if company, companyErr := s.orgs.GetCompany(ctx, organizationID, companyID); companyErr == nil && company.CNPJ != "" {
		branchCNPJ = company.CNPJ
	}

	for _, item := range items {
		poResolution, err := matchPurchaseOrder(ctx, tx, adapter, organizationID, scenario, rule, header.IssuerCNPJ, branchCNPJ, vendorMatchCode(vendorMatch), item)
		if err != nil {
			if _, ok := asAdapterFailure(err); ok {
				return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.sap_unavailable.v1", map[string]any{"step": "purchase_order"})
			}
			return err
		}
		if _, err := validatePOReference(ctx, tx, organizationID, scenario.ID, item, poResolution); err != nil {
			return err
		}
		if poResolution.ResolvedNumber != "" {
			item.ResolvedPurchaseOrderNumber = nullEmptyStr(poResolution.ResolvedNumber)
			item.ResolvedPurchaseOrderItem = nullEmptyStr(poResolution.ResolvedItem)
		}

		materialMatch, err := matchMaterial(ctx, tx, adapter, organizationID, &companyIDCopy, header.IssuerCNPJ, branchCNPJ, vendorMatchCode(vendorMatch), item)
		if err != nil {
			if _, ok := asAdapterFailure(err); ok {
				return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.sap_unavailable.v1", map[string]any{"step": "material"})
			}
			return err
		}
		if _, err := validateMaterial(ctx, tx, organizationID, scenario.ID, rule, item, materialMatch); err != nil {
			return err
		}
		if materialMatch.ResolvedValue != nil {
			item.ResolvedMaterialCode = materialMatch.ResolvedValue
		}

		if _, err := validateQuantityAndPrice(ctx, tx, adapter, organizationID, scenario.ID, rule, item, header.IssuerCNPJ, branchCNPJ); err != nil {
			if _, ok := asAdapterFailure(err); ok {
				return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.sap_unavailable.v1", map[string]any{"step": "quantity_price"})
			}
			return err
		}

		item.Status = computeItemStatus(poResolution.Outcome, materialMatch.Status)
		if err := updateItemFields(ctx, tx, item); err != nil {
			return err
		}

		switch poResolution.Outcome {
		case "missing_reject", "not_found_reject":
			reject = true
			rejectReason = "Pedido de compra ausente ou não encontrado (ação configurada: REJECT), item " + strconv.Itoa(item.ItemNumber)
		case "missing_wait", "not_found_wait":
			actionRequired = true
			actionRequiredReason = "Pedido de compra ausente ou não encontrado — aguardando decisão manual, item " + strconv.Itoa(item.ItemNumber)
		case "not_found_create_po":
			needsPOCreation = true
		}
		if item.Status == ItemStatusNeedsCorrection || item.Status == ItemStatusBlocked {
			actionRequired = true
			if actionRequiredReason == "" {
				actionRequiredReason = "Item " + strconv.Itoa(item.ItemNumber) + " precisa de correção manual (" + item.Status + ")"
			}
		}
	}

	if _, err := validateTax(ctx, tx, organizationID, documentID, scenario.ID, rule); err != nil {
		return err
	}

	if reject {
		return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusRejected, fiscal.ProcessingCompleted, "fiscal.inbound.rejected.v1", map[string]any{"reason": rejectReason})
	}
	if actionRequired {
		return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusActionRequired, fiscal.ProcessingWaiting, "fiscal.inbound.action_required.v1", map[string]any{"reason": actionRequiredReason})
	}

	plan, steps, err := s.buildExecutionPlanTx(ctx, tx, organizationID, documentID, scenario, rule, needsPOCreation)
	if err != nil {
		return err
	}
	if len(steps) == 0 {
		_ = plan
		return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusCompleted, fiscal.ProcessingCompleted, "fiscal.inbound.completed.v1", map[string]any{"step_count": 0})
	}
	return markDocumentStatus(ctx, tx, organizationID, documentID, DocStatusReadyForPosting, fiscal.ProcessingWaiting, "fiscal.inbound.plan_built.v1", map[string]any{
		"template_code": scenario.ProcessTemplateCode,
		"step_count":    len(steps),
	})
}

func computeItemStatus(poOutcome, materialStatus string) string {
	switch poOutcome {
	case "missing_reject", "not_found_reject":
		return ItemStatusBlocked
	case "missing_wait", "not_found_wait":
		return ItemStatusNeedsCorrection
	}
	if materialStatus != MatchStatusMatched && materialStatus != MatchStatusManualMap {
		return ItemStatusNeedsCorrection
	}
	return ItemStatusMatched
}

func vendorMatchCode(m Match) string {
	if m.ResolvedValue == nil {
		return ""
	}
	return *m.ResolvedValue
}
