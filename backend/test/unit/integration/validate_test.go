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

func TestResolveCapabilities_EmptyMeansAllEnabled(t *testing.T) {
	t.Parallel()

	got := integration.ResolveCapabilities(integration.Capabilities{})
	want := integration.DefaultCapabilities()
	if got != want {
		t.Fatalf("empty capabilities: got %+v, want %+v", got, want)
	}
}

func TestResolveCapabilities_KeepsExplicitGate(t *testing.T) {
	t.Parallel()

	in := integration.Capabilities{GoodsReceipt: true, SupplierInvoice: true}
	got := integration.ResolveCapabilities(in)
	if got.InboundDelivery {
		t.Fatal("explicit capability set should not enable inbound delivery")
	}
	if !got.GoodsReceipt || !got.SupplierInvoice {
		t.Fatalf("expected goods receipt and invoice to stay enabled, got %+v", got)
	}
}

func TestMergeCapabilities_PreservesExistingWhenIncomingEmpty(t *testing.T) {
	t.Parallel()

	existing := integration.Capabilities{InboundDelivery: true, GoodsReceipt: true}
	got := integration.MergeCapabilities(integration.Capabilities{}, existing)
	if got != existing {
		t.Fatalf("expected existing capabilities to be kept, got %+v", got)
	}
}

func TestMergeCapabilities_IncomingWinsWhenConfigured(t *testing.T) {
	t.Parallel()

	incoming := integration.Capabilities{GoodsReceipt: true}
	existing := integration.Capabilities{InboundDelivery: true, GoodsReceipt: true}
	got := integration.MergeCapabilities(incoming, existing)
	if got.InboundDelivery {
		t.Fatal("incoming explicit set should replace existing inbound delivery")
	}
	if !got.GoodsReceipt {
		t.Fatal("expected goods receipt from incoming payload")
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
