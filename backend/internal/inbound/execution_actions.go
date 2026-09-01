package inbound

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// RebuildExecutionPlan recomputes needsPOCreation from the current item
// state and (re)builds the execution plan — used by the manual "plan"
// endpoint after the operator corrects/overrides an item.
func (s *Service) RebuildExecutionPlan(ctx context.Context, organizationID, documentID uuid.UUID) (*ExecutionPlan, []PlanStep, error) {
	scenarioID, err := getDocumentScenarioID(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, nil, err
	}
	scenarioWithRule, err := s.GetScenario(ctx, organizationID, scenarioID)
	if err != nil {
		return nil, nil, err
	}
	items, err := listItems(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, nil, err
	}
	needsPOCreation := false
	for _, it := range items {
		if it.ResolvedPurchaseOrderNumber == nil && scenarioWithRule.Rule.PONotFoundAction == PONotFoundCreatePO {
			needsPOCreation = true
		}
	}
	return s.BuildExecutionPlan(ctx, organizationID, documentID, scenarioWithRule.Scenario, scenarioWithRule.Rule, needsPOCreation)
}

// ExecuteNext runs whichever step is currently ready/awaiting/failed for a
// document (spec §31 "POST /fiscal-documents/{id}/execute") — the coarse
// counterpart to advancing a specific step_id directly.
func (s *Service) ExecuteNext(ctx context.Context, organizationID, documentID uuid.UUID, actorType, actorID string) (*PlanStep, error) {
	if _, err := getLatestPlan(ctx, s.pool, organizationID, documentID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.Conflict("no_execution_plan", "No execution plan exists for this document yet")
		}
		return nil, err
	}
	steps, err := listPlanSteps(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	for _, st := range steps {
		switch st.Status {
		case PlanStepStatusReady, PlanStepStatusAwaitingManual, PlanStepStatusFailed, PlanStepStatusActionRequired:
			return s.AdvanceStep(ctx, AdvanceStepInput{
				OrganizationID: organizationID, DocumentID: documentID, StepID: st.ID,
				Action: "run", ActorType: actorType, ActorID: actorID,
			})
		}
	}
	return nil, domainerr.Conflict("no_step_ready", "No execution plan step is ready to run")
}
