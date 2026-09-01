package fiscal_test

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestNormalizeReceiveInput(t *testing.T) {
	t.Parallel()

	payload := helpers.ReadTestdata(t, "fiscal", "nfe_payload.json")
	base := fiscal.ReceiveInput{
		OrganizationCompanyID: uuid.New(),
		DocumentType:          "NFe",
		Direction:             "",
		SourceSystem:          "SAP",
		IdempotencyKey:        "idem-1",
		Payload:               payload,
	}

	t.Run("defaults_direction_and_content_type", func(t *testing.T) {
		t.Parallel()
		got, err := fiscal.NormalizeReceiveInput(base)
		if err != nil {
			t.Fatal(err)
		}
		if got.DocumentType != "nfe" || got.Direction != "outbound" || got.ContentType != "application/json" {
			t.Fatalf("unexpected %#v", got)
		}
		if got.ServiceCode != "nfe_outbound" {
			t.Fatalf("service=%s", got.ServiceCode)
		}
	})

	t.Run("nfse_inbound", func(t *testing.T) {
		t.Parallel()
		in := base
		in.DocumentType = "nfse"
		in.Direction = "inbound"
		in.Payload = helpers.ReadTestdata(t, "fiscal", "nfse_payload.json")
		got, err := fiscal.NormalizeReceiveInput(in)
		if err != nil {
			t.Fatal(err)
		}
		if got.ServiceCode != "nfse_inbound" {
			t.Fatalf("service=%s", got.ServiceCode)
		}
	})

	t.Run("missing_idempotency", func(t *testing.T) {
		t.Parallel()
		in := base
		in.IdempotencyKey = ""
		_, err := fiscal.NormalizeReceiveInput(in)
		helpers.AssertDomainCode(t, err, "missing_idempotency_key")
	})

	t.Run("invalid_type", func(t *testing.T) {
		t.Parallel()
		in := base
		in.DocumentType = "cte"
		_, err := fiscal.NormalizeReceiveInput(in)
		helpers.AssertDomainCode(t, err, "invalid_document_type")
	})

	t.Run("missing_payload", func(t *testing.T) {
		t.Parallel()
		in := base
		in.Payload = nil
		_, err := fiscal.NormalizeReceiveInput(in)
		helpers.AssertDomainCode(t, err, "missing_payload")
	})
}

func TestStatusHelpers(t *testing.T) {
	t.Parallel()

	if !fiscal.IsTerminalStatus(fiscal.StatusAuthorized) || fiscal.IsTerminalStatus(fiscal.StatusReceived) {
		t.Fatal("terminal status mismatch")
	}
	if fiscal.ServiceCodeFor("nfse", "inbound") != "nfse_inbound" {
		t.Fatal("service code mismatch")
	}
	if fiscal.EventTypeForOutcome("authorized") != "fiscal.document.authorized.v1" {
		t.Fatal("event type mismatch")
	}

	status, processing, ok := fiscal.NextStatusesFromProvider("rejected")
	if !ok || status != fiscal.StatusRejected || processing != fiscal.ProcessingCompleted {
		t.Fatalf("got %s %s %v", status, processing, ok)
	}
	_, _, ok = fiscal.NextStatusesFromProvider("unknown")
	if ok {
		t.Fatal("expected unknown outcome to fail")
	}
}

func TestParseTransmissionResult(t *testing.T) {
	t.Parallel()

	orgID := uuid.New()
	docID := uuid.New()
	envelope := `{
		"specversion": "1.0",
		"id": "` + uuid.NewString() + `",
		"source": "nfe_gateway/outbound_consumer",
		"type": "fiscal.document.transmission_result.v1",
		"subject": "organization_documents/` + docID.String() + `",
		"time": "2026-08-16T12:00:00Z",
		"datacontenttype": "application/json",
		"organization_id": "` + orgID.String() + `",
		"data": {
			"document_id": "` + docID.String() + `",
			"outcome": "authorized",
			"protocol": "PROT-123"
		}
	}`

	gotOrgID, result, err := fiscal.ParseTransmissionResult([]byte(envelope))
	if err != nil {
		t.Fatal(err)
	}
	if gotOrgID != orgID {
		t.Fatalf("organization_id=%s, want %s", gotOrgID, orgID)
	}
	if result.DocumentID != docID {
		t.Fatalf("document_id=%s, want %s", result.DocumentID, docID)
	}
	if result.Outcome != "authorized" || result.Protocol != "PROT-123" {
		t.Fatalf("unexpected %#v", result)
	}
}

func TestParseTransmissionResultRejectsGarbage(t *testing.T) {
	t.Parallel()

	if _, _, err := fiscal.ParseTransmissionResult([]byte("not json")); err == nil {
		t.Fatal("expected an error decoding garbage")
	}
}

func TestIsStaleStatusConflict(t *testing.T) {
	t.Parallel()

	if !fiscal.IsStaleStatusConflict(domainerr.Conflict("stale_document_status", "changed concurrently")) {
		t.Fatal("expected stale_document_status to be recognized as a stale conflict")
	}
	if fiscal.IsStaleStatusConflict(domainerr.Conflict("idempotency_key_reuse", "different payload")) {
		t.Fatal("a different conflict code must not be treated as a stale-status replay")
	}
	if fiscal.IsStaleStatusConflict(errors.New("plain error")) {
		t.Fatal("a non-domainerr error must not be treated as a stale-status replay")
	}
}

func TestStubProvider(t *testing.T) {
	t.Parallel()

	key := "NFe-REJECT-001"
	rejected, err := (fiscal.StubProvider{}).Transmit(t.Context(), fiscal.Document{
		ID: uuid.New(), DocumentKey: &key,
	})
	if err != nil {
		t.Fatal(err)
	}
	if rejected.Outcome != "rejected" {
		t.Fatalf("outcome=%s", rejected.Outcome)
	}

	authorized, err := (fiscal.StubProvider{}).Transmit(t.Context(), fiscal.Document{ID: uuid.New()})
	if err != nil {
		t.Fatal(err)
	}
	if authorized.Outcome != "authorized" || authorized.Protocol == "" {
		t.Fatalf("unexpected %#v", authorized)
	}
}
