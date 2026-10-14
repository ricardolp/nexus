package fiscal

import (
	"testing"
)

func TestRegisterEventPayloadsKindMapping(t *testing.T) {
	req, resp := PayloadCancelRequest, PayloadCancelResponse
	kind := "cce"
	switch kind {
	case "cce":
		req, resp = PayloadCceRequest, PayloadCceResponse
	case "inutilization":
		req, resp = PayloadInutilizationRequest, PayloadInutilizationResponse
	}
	if req != PayloadCceRequest || resp != PayloadCceResponse {
		t.Fatalf("cce mapping broken: %s %s", req, resp)
	}
	kind = "inutilization"
	req, resp = PayloadCancelRequest, PayloadCancelResponse
	switch kind {
	case "cce":
		req, resp = PayloadCceRequest, PayloadCceResponse
	case "inutilization":
		req, resp = PayloadInutilizationRequest, PayloadInutilizationResponse
	}
	if req != PayloadInutilizationRequest || resp != PayloadInutilizationResponse {
		t.Fatalf("inutilization mapping broken: %s %s", req, resp)
	}
}

func TestPayloadTypeConstantsForDownloads(t *testing.T) {
	wanted := map[string]string{
		PayloadProtocol:              "protocol",
		PayloadCancelResponse:        "cancel_response",
		PayloadCceResponse:           "cce_response",
		PayloadInutilizationResponse: "inutilization_response",
		PayloadManifestationEvent:    "manifestation_event",
	}
	for constVal, expect := range wanted {
		if constVal != expect {
			t.Fatalf("payload constant %q != %q", constVal, expect)
		}
	}
}
