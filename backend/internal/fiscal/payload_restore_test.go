package fiscal

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
)

func TestCompleteInboundBodyUsesTheLogWhenTheHashMatches(t *testing.T) {
	body := []byte(`{"numero":"1041","prestador":{"cnpj":"00000000000191"}}`)
	got := completeInboundBody([]inboundLogBody{{
		Preview:     string(body),
		RequestHash: crypto.SHA256Hex(body),
	}}, crypto.SHA256Hex(body), "application/json")
	if string(got) != string(body) {
		t.Fatalf("got %q", got)
	}
}

func TestCompleteInboundBodyIgnoresATruncatedPreview(t *testing.T) {
	full := []byte(`{"numero":"1041","discriminacao":"servico completo"}`)
	preview := string(full[:20])
	got := completeInboundBody([]inboundLogBody{{
		Preview:     preview,
		RequestHash: crypto.SHA256Hex(full),
	}}, crypto.SHA256Hex(full), "application/json")
	if got != nil {
		t.Fatalf("truncated preview was accepted: %q", got)
	}
}

func TestCompleteInboundBodySkipsADifferentPayload(t *testing.T) {
	older := []byte(`{"numero":"1000"}`)
	current := []byte(`{"numero":"1041"}`)
	got := completeInboundBody([]inboundLogBody{
		{Preview: string(older), RequestHash: crypto.SHA256Hex(older)},
		{Preview: string(current), RequestHash: crypto.SHA256Hex(current)},
	}, crypto.SHA256Hex(current), "application/json")
	if string(got) != string(current) {
		t.Fatalf("got %q", got)
	}
}
