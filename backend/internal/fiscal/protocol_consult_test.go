package fiscal

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
)

func TestParseProtocolResult(t *testing.T) {
	docID := uuid.New()
	orgID := uuid.New()
	payload, err := json.Marshal(map[string]any{
		"organization_id": orgID.String(),
		"data": map[string]any{
			"document_id":         docID.String(),
			"outcome":             "ok",
			"protocol":            "142260000000001",
			"protocol_object_key": "fiscal/x.protocol.xml",
			"events": []map[string]any{
				{
					"event_kind":         "manifestation",
					"tp_evento":          "210240",
					"manifestation_type": "operacao_nao_realizada",
					"protocol":           "EVT1",
					"n_seq_evento":       "1",
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	gotOrg, result, err := ParseProtocolResult(payload)
	if err != nil {
		t.Fatal(err)
	}
	if gotOrg != orgID {
		t.Fatalf("org: got %s want %s", gotOrg, orgID)
	}
	if result.DocumentID == nil || *result.DocumentID != docID {
		t.Fatalf("document_id mismatch: %+v", result.DocumentID)
	}
	if result.Protocol != "142260000000001" {
		t.Fatalf("protocol: %q", result.Protocol)
	}
	if len(result.Events) != 1 || result.Events[0].TpEvento != "210240" {
		t.Fatalf("events: %+v", result.Events)
	}
}
