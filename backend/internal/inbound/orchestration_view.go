package inbound

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// GetOrchestrationView assembles the full read model for a document (spec
// §40): resolved scenario, items, matches, validations, overrides and the
// latest execution plan with its steps. Missing scenario/plan (not yet
// resolved/built) are represented as nil, not an error.
func (s *Service) GetOrchestrationView(ctx context.Context, organizationID, documentID uuid.UUID) (*OrchestrationView, error) {
	view := &OrchestrationView{DocumentID: documentID}

	items, err := listItems(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	view.Items = items

	matches, err := listMatches(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	view.Matches = matches

	validations, err := listValidations(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	view.Validations = validations

	overrides, err := listOverrides(ctx, s.pool, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	view.Overrides = overrides

	if scenarioID, err := getDocumentScenarioID(ctx, s.pool, organizationID, documentID); err == nil {
		if scenario, err := s.GetScenario(ctx, organizationID, scenarioID); err == nil {
			view.Scenario = scenario
		} else {
			return nil, err
		}
	}

	plan, err := getLatestPlan(ctx, s.pool, organizationID, documentID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if plan != nil && err == nil {
		view.Plan = plan
		steps, err := listPlanSteps(ctx, s.pool, organizationID, documentID)
		if err != nil {
			return nil, err
		}
		view.Steps = steps
	}

	return view, nil
}
