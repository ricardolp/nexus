package organization

import (
	"strings"
	"testing"
)

func TestGenerateInboundOrgTokenShape(t *testing.T) {
	t.Parallel()

	token, err := generateInboundOrgToken()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasPrefix(token, "nx_") {
		t.Fatalf("prefix: got %q", token)
	}
	if len(token) < 16 {
		t.Fatalf("too short: %d", len(token))
	}
	hint := tokenHint(token)
	if hint == nil || *hint != token[len(token)-4:] {
		t.Fatalf("hint=%v token=%q", hint, token)
	}
}

func TestTokenHintEmpty(t *testing.T) {
	t.Parallel()

	if tokenHint("") != nil || tokenHint("ab") != nil {
		t.Fatal("expected nil hint for short tokens")
	}
}
