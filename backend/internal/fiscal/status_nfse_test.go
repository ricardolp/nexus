package fiscal

import "testing"

func TestNextStatusesFromProvider_NFSeSynchronousOutcomes(t *testing.T) {
	// SEFIN Nacional is synchronous — NFS-e outbound never uses waiting_recibo.
	for _, outcome := range []string{"authorized", "rejected"} {
		status, processing, ok := NextStatusesFromProvider(outcome)
		if !ok {
			t.Fatalf("outcome %q should map", outcome)
		}
		if processing != ProcessingCompleted {
			t.Fatalf("outcome %q processing=%q, want completed", outcome, processing)
		}
		if status == "" {
			t.Fatalf("outcome %q empty status", outcome)
		}
	}
	if EventTypeForOutcome("authorized") != "fiscal.document.authorized.v1" {
		t.Fatal("authorized event type")
	}
	if EventTypeForOutcome("rejected") != "fiscal.document.rejected.v1" {
		t.Fatal("rejected event type")
	}
}
