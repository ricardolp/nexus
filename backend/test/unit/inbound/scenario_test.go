package inbound_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/inbound"
)

func TestProcessTemplates_KnownCodesOnly(t *testing.T) {
	t.Parallel()

	for _, code := range []string{
		inbound.TemplateStandardPurchase,
		inbound.TemplateEWMPurchase,
		inbound.TemplateDirectGR,
		inbound.TemplateService,
		inbound.TemplateFIOnly,
	} {
		if _, ok := inbound.ProcessTemplates[code]; !ok {
			t.Fatalf("expected template %q to be registered", code)
		}
	}
}

func TestIsTerminalInboundStatus(t *testing.T) {
	t.Parallel()

	terminal := []string{inbound.DocStatusCompleted, inbound.DocStatusRejected, inbound.DocStatusFailed}
	for _, s := range terminal {
		if !inbound.IsTerminalInboundStatus(s) {
			t.Fatalf("expected %q to be terminal", s)
		}
	}
	nonTerminal := []string{inbound.DocStatusReceived, inbound.DocStatusActionRequired, inbound.DocStatusReadyForPosting}
	for _, s := range nonTerminal {
		if inbound.IsTerminalInboundStatus(s) {
			t.Fatalf("expected %q to not be terminal", s)
		}
	}
}
