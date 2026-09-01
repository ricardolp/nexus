package integration_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration"
)

func TestCreateInput_RequiresIntegrationType(t *testing.T) {
	t.Parallel()

	svc := integration.NewService(nil, nil)
	_, err := svc.Create(nil, integration.CreateInput{ //nolint:staticcheck // nil ctx/pool: validation short-circuits before any I/O
		OrganizationID:  uuid.New(),
		Name:            "SAP CPI Prod",
		IntegrationType: "not_a_real_type",
		Environment:     "production",
		BaseURL:         "https://cpi.example.com",
	})
	if err == nil {
		t.Fatal("expected error for unsupported integration_type")
	}
}

func TestCreateInput_RequiresBaseURL(t *testing.T) {
	t.Parallel()

	svc := integration.NewService(nil, nil)
	_, err := svc.Create(nil, integration.CreateInput{ //nolint:staticcheck
		OrganizationID:  uuid.New(),
		Name:            "SAP CPI Prod",
		IntegrationType: integration.TypeSAPCPI,
		Environment:     "production",
	})
	if err == nil {
		t.Fatal("expected error for missing base_url")
	}
}

func TestCreateInput_RequiresValidEnvironment(t *testing.T) {
	t.Parallel()

	svc := integration.NewService(nil, nil)
	_, err := svc.Create(nil, integration.CreateInput{ //nolint:staticcheck
		OrganizationID:  uuid.New(),
		Name:            "SAP CPI Prod",
		IntegrationType: integration.TypeSAPCPI,
		Environment:     "staging",
		BaseURL:         "https://cpi.example.com",
	})
	if err == nil {
		t.Fatal("expected error for invalid environment")
	}
}
