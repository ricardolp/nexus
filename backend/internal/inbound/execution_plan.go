package inbound

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type plannedStep struct {
	stepType string
	mode     string
}

// execModeFor maps a scenario rule's step config (DISABLED/AUTO/MANUAL/
// CONDITIONAL) to the plan step's execution mode. CONDITIONAL is treated as
// MANUAL for this iteration — a rule engine to evaluate the condition is
// out of scope (spec §56-57); the operator always confirms explicitly.
func execModeFor(mode string) string {
	if mode == StepConfigAuto {
		return StepExecModeAuto
	}
	return StepExecModeManual
}

// planStepsFor resolves which mutating SAP steps a document's execution
// plan needs, in order, applying the process template (spec §8) and any
// per-scenario override (spec: "pode sobrescrever etapas"). Read-only steps
// (resolve vendor/material, search purchase order) are not planned here —
// they already ran, synchronously and always automatically, during
// matching (see Service.IngestInbound).
func planStepsFor(templateCode string, rule ScenarioRule, needsPOCreation bool) ([]plannedStep, error) {
	templateSteps, ok := ProcessTemplates[templateCode]
	if !ok {
		return nil, domainerr.Validation("invalid_process_template", "unknown process_template_code: "+templateCode)
	}

	var planned []plannedStep
	for _, st := range templateSteps {
		switch st {
		case StepCreatePurchaseOrder:
			if !needsPOCreation {
				continue
			}
			planned = append(planned, plannedStep{st, StepExecModeAuto})
		case StepCreateInboundDelivery:
			if rule.InboundDeliveryMode == StepConfigDisabled {
				continue
			}
			planned = append(planned, plannedStep{st, execModeFor(rule.InboundDeliveryMode)})
		case StepPostGoodsReceipt:
			if rule.GoodsReceiptMode == StepConfigDisabled {
				continue
			}
			planned = append(planned, plannedStep{st, execModeFor(rule.GoodsReceiptMode)})
		case StepCreateServiceEntry:
			// Service entry reuses goods_receipt_mode as its automation gate
			// — it is the goods-receipt equivalent for the SERVICE template,
			// and the schema does not carry a dedicated column for it.
			if rule.GoodsReceiptMode == StepConfigDisabled {
				continue
			}
			planned = append(planned, plannedStep{st, execModeFor(rule.GoodsReceiptMode)})
		case StepPostSupplierInvoice:
			if rule.SupplierInvoiceMode == StepConfigDisabled {
				continue
			}
			planned = append(planned, plannedStep{st, execModeFor(rule.SupplierInvoiceMode)})
		case StepPostAccountingDocument:
			planned = append(planned, plannedStep{st, StepExecModeAuto})
		}
	}
	return planned, nil
}

// BuildExecutionPlan assembles the execution plan (spec §30) for a document
// whose matching/validation already ran. needsPOCreation should be true
// when at least one item's purchase order still needs to be created
// (po_not_found_action=CREATE_PO and no PO resolved for it).
func (s *Service) BuildExecutionPlan(ctx context.Context, organizationID, documentID uuid.UUID, scenario Scenario, rule ScenarioRule, needsPOCreation bool) (*ExecutionPlan, []PlanStep, error) {
	var plan *ExecutionPlan
	var steps []PlanStep
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		p, st, err := s.buildExecutionPlanTx(ctx, tx, organizationID, documentID, scenario, rule, needsPOCreation)
		plan, steps = p, st
		return err
	})
	if err != nil {
		return nil, nil, err
	}
	return plan, steps, nil
}

// buildExecutionPlanTx is BuildExecutionPlan's logic running inside a
// caller-supplied transaction — used by IngestInbound so plan creation is
// atomic with the matching/validation that decided it was needed.
func (s *Service) buildExecutionPlanTx(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, scenario Scenario, rule ScenarioRule, needsPOCreation bool) (*ExecutionPlan, []PlanStep, error) {
	planned, err := planStepsFor(scenario.ProcessTemplateCode, rule, needsPOCreation)
	if err != nil {
		return nil, nil, err
	}

	now := time.Now().UTC()
	var plan ExecutionPlan
	var steps []PlanStep

	err = func() error {
		var maxVersion int
		if err := tx.QueryRow(ctx, `
			select coalesce(max(version), 0) from organization_execution_plans where organization_document_id = $1
		`, documentID).Scan(&maxVersion); err != nil {
			return err
		}
		if maxVersion > 0 {
			if _, err := tx.Exec(ctx, `
				update organization_execution_plans set status = $3, updated_at = $4
				where organization_document_id = $1 and version = $2 and status not in ('COMPLETED','CANCELLED','FAILED')
			`, documentID, maxVersion, PlanStatusCancelled, now); err != nil {
				return err
			}
		}

		plan = ExecutionPlan{
			ID:                     ids.New(),
			OrganizationID:         organizationID,
			OrganizationDocumentID: documentID,
			Version:                maxVersion + 1,
			Status:                 PlanStatusReady,
			CreatedAt:              now,
			UpdatedAt:              now,
		}
		if len(planned) == 0 {
			plan.Status = PlanStatusCompleted
		}
		if _, err := tx.Exec(ctx, `
			insert into organization_execution_plans (id, organization_id, organization_document_id, version, status, created_at, updated_at)
			values ($1,$2,$3,$4,$5,$6,$7)
		`, plan.ID, plan.OrganizationID, plan.OrganizationDocumentID, plan.Version, plan.Status, now, now); err != nil {
			return err
		}

		var previousStepID *uuid.UUID
		for i, p := range planned {
			step := PlanStep{
				ID:                     ids.New(),
				OrganizationID:         organizationID,
				ExecutionPlanID:        plan.ID,
				OrganizationDocumentID: documentID,
				Sequence:               i + 1,
				StepType:               p.stepType,
				Mode:                   p.mode,
				DependencyStepID:       previousStepID,
				IdempotencyKey:         idempotencyKey(documentID, p.stepType, i+1),
				RequestPayloadJSON:     json.RawMessage(`{}`),
				ResponsePayloadJSON:    json.RawMessage(`{}`),
				CreatedAt:              now,
				UpdatedAt:              now,
			}
			if i == 0 {
				if p.mode == StepExecModeAuto {
					step.Status = PlanStepStatusReady
				} else {
					step.Status = PlanStepStatusAwaitingManual
				}
			} else {
				step.Status = PlanStepStatusPending
			}

			if _, err := tx.Exec(ctx, `
				insert into organization_execution_plan_steps (
					id, organization_id, organization_execution_plan_id, organization_document_id, sequence,
					step_type, mode, status, dependency_step_id, idempotency_key,
					request_payload_json, response_payload_json, created_at, updated_at
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
			`, step.ID, step.OrganizationID, step.ExecutionPlanID, step.OrganizationDocumentID, step.Sequence,
				step.StepType, step.Mode, step.Status, step.DependencyStepID, step.IdempotencyKey,
				step.RequestPayloadJSON, step.ResponsePayloadJSON, now, now); err != nil {
				return err
			}
			steps = append(steps, step)
			id := step.ID
			previousStepID = &id
		}
		return nil
	}()
	if err != nil {
		return nil, nil, err
	}
	return &plan, steps, nil
}

func idempotencyKey(documentID uuid.UUID, stepType string, sequence int) string {
	return documentID.String() + ":" + stepType + ":" + strconv.Itoa(sequence)
}

func listPlanSteps(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) ([]PlanStep, error) {
	rows, err := tx.Query(ctx, `
		select id, organization_id, organization_execution_plan_id, organization_document_id, sequence, step_type,
		       mode, status, dependency_step_id, idempotency_key, request_payload_json, response_payload_json,
		       sap_document_number, error_code, error_message_sanitized, started_at, finished_at, created_at, updated_at
		from organization_execution_plan_steps
		where organization_id = $1 and organization_document_id = $2
		order by sequence
	`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PlanStep
	for rows.Next() {
		s, err := scanPlanStep(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

func scanPlanStep(row rowScanner) (PlanStep, error) {
	var s PlanStep
	err := row.Scan(&s.ID, &s.OrganizationID, &s.ExecutionPlanID, &s.OrganizationDocumentID, &s.Sequence, &s.StepType,
		&s.Mode, &s.Status, &s.DependencyStepID, &s.IdempotencyKey, &s.RequestPayloadJSON, &s.ResponsePayloadJSON,
		&s.SAPDocumentNumber, &s.ErrorCode, &s.ErrorMessageSanitized, &s.StartedAt, &s.FinishedAt, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func getLatestPlan(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) (*ExecutionPlan, error) {
	row := tx.QueryRow(ctx, `
		select id, organization_id, organization_document_id, version, status, created_at, updated_at
		from organization_execution_plans
		where organization_id = $1 and organization_document_id = $2
		order by version desc limit 1
	`, organizationID, documentID)
	var p ExecutionPlan
	if err := row.Scan(&p.ID, &p.OrganizationID, &p.OrganizationDocumentID, &p.Version, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, err
	}
	return &p, nil
}
