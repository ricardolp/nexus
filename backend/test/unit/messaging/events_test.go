package messaging_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/messaging"
)

func TestNewCloudEvent(t *testing.T) {
	t.Parallel()

	eventID := uuid.New()
	orgID := uuid.New()
	docID := uuid.New()

	envelope, payload, err := messaging.NewCloudEvent(
		eventID, orgID, docID,
		"fiscal_saas/inbound_api",
		messaging.EventDocumentReceived,
		"organization_documents",
		map[string]any{"document_id": docID.String()},
	)
	if err != nil {
		t.Fatal(err)
	}
	if envelope.SpecVersion != "1.0" || envelope.Type != messaging.EventDocumentReceived {
		t.Fatalf("unexpected envelope %#v", envelope)
	}
	if envelope.Subject != "organization_documents/"+docID.String() {
		t.Fatalf("subject=%s", envelope.Subject)
	}

	var decoded messaging.CloudEvent
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.OrganizationID != orgID || decoded.ID != eventID {
		t.Fatalf("decoded ids mismatch")
	}
}
