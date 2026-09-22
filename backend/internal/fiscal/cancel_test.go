package fiscal

import (
	"testing"

	"github.com/google/uuid"
)

func TestNextStatusesFromEventResultCancelRejectedRestoresAuthorized(t *testing.T) {
	status, processing, ok := NextStatusesFromEventResult("cancel", "rejected")
	if !ok {
		t.Fatal("expected ok")
	}
	if status != StatusAuthorized || processing != ProcessingCompleted {
		t.Fatalf("got %s/%s, want authorized/completed", status, processing)
	}
}

func TestNextStatusesFromEventResultCancelAccepted(t *testing.T) {
	status, processing, ok := NextStatusesFromEventResult("cancel", "accepted")
	if !ok || status != StatusCancelled || processing != ProcessingCompleted {
		t.Fatalf("got ok=%v %s/%s", ok, status, processing)
	}
}

func TestNormalizeAccessKey(t *testing.T) {
	got := normalizeAccessKey(" 3550-3081.2345 ")
	if got != "355030812345" {
		t.Fatalf("got %q", got)
	}
}

func TestParseEventResultIncludesCancelObjectKeys(t *testing.T) {
	docID := uuid.New()
	orgID := uuid.New()
	payload := []byte(`{
		"specversion": "1.0",
		"id": "` + uuid.NewString() + `",
		"source": "nfe_gateway/event_consumer",
		"type": "fiscal.document.event_result.v1",
		"organization_id": "` + orgID.String() + `",
		"data": {
			"document_id": "` + docID.String() + `",
			"event_kind": "cancel",
			"outcome": "accepted",
			"protocol": "IDEVT123",
			"cstat": "135",
			"x_motivo": "Evento registrado",
			"request_object_key": "fiscal/a.cancel_request.xml",
			"response_object_key": "fiscal/a.cancel_response.xml"
		}
	}`)
	gotOrg, result, err := ParseEventResult(payload)
	if err != nil {
		t.Fatal(err)
	}
	if gotOrg != orgID {
		t.Fatalf("org: got %s want %s", gotOrg, orgID)
	}
	if result.DocumentID == nil || *result.DocumentID != docID {
		t.Fatalf("document_id: %#v", result.DocumentID)
	}
	if result.RequestObjectKey != "fiscal/a.cancel_request.xml" {
		t.Fatalf("request key: %q", result.RequestObjectKey)
	}
	if result.ResponseObjectKey != "fiscal/a.cancel_response.xml" {
		t.Fatalf("response key: %q", result.ResponseObjectKey)
	}
	if result.Protocol != "IDEVT123" {
		t.Fatalf("protocol: %q", result.Protocol)
	}
}

func TestPayloadCancelConstants(t *testing.T) {
	if PayloadCancelRequest != "cancel_request" || PayloadCancelResponse != "cancel_response" {
		t.Fatalf("unexpected constants %q %q", PayloadCancelRequest, PayloadCancelResponse)
	}
}
