package fiscal

import (
	"testing"
)

func TestLooksLikeNFeAccessKey(t *testing.T) {
	t.Parallel()
	valid := "42260913677964000200550020000693421415071225"
	if !LooksLikeNFeAccessKey(valid) {
		t.Fatal("expected valid chave")
	}
	if !LooksLikeNFeAccessKey("  " + valid + "  ") {
		t.Fatal("expected trimmed chave")
	}
	if LooksLikeNFeAccessKey("not-a-key") {
		t.Fatal("rejected garbage")
	}
	if LooksLikeNFeAccessKey("550e8400-e29b-41d4-a716-446655440000") {
		t.Fatal("UUID must not look like access key")
	}
}

func TestParseNFeAccessKey(t *testing.T) {
	t.Parallel()
	parts, err := parseNFeAccessKey("42260913677964000200550020000693421415071225")
	if err != nil {
		t.Fatal(err)
	}
	if parts.IssuerCNPJ != "13677964000200" {
		t.Fatalf("cnpj: %q", parts.IssuerCNPJ)
	}
	if parts.Model != "55" {
		t.Fatalf("model: %q", parts.Model)
	}
	if parts.Series != "2" {
		t.Fatalf("series: %q", parts.Series)
	}
	if parts.Number != "69342" {
		t.Fatalf("number: %q", parts.Number)
	}
}

func TestStatusesFromProtocolConsult(t *testing.T) {
	t.Parallel()
	status, proc, _, ok := statusesFromProtocolConsult(ProtocolConsultResult{Outcome: "ok", CStat: "100"})
	if !ok || status != StatusAuthorized || proc != ProcessingCompleted {
		t.Fatalf("authorized: %s %s ok=%v", status, proc, ok)
	}
	status, proc, _, ok = statusesFromProtocolConsult(ProtocolConsultResult{Outcome: "ok", CStat: "101"})
	if !ok || status != StatusCancelled {
		t.Fatalf("cancelled: %s ok=%v", status, ok)
	}
	status, proc, _, ok = statusesFromProtocolConsult(ProtocolConsultResult{Outcome: "not_found"})
	if !ok || status != StatusFailed || proc != ProcessingFailed {
		t.Fatalf("not_found: %s %s", status, proc)
	}
	status, proc, _, ok = statusesFromProtocolConsult(ProtocolConsultResult{Outcome: "ok", CStat: "302"})
	if !ok || status != StatusRejected {
		t.Fatalf("rejected: %s", status)
	}
}

func TestIsStatusConsultDocument(t *testing.T) {
	t.Parallel()
	if !IsStatusConsultDocument(statusConsultIdempotencyKey("42260913677964000200550020000693421415071225")) {
		t.Fatal("expected prefix match")
	}
	if IsStatusConsultDocument("normal-key") {
		t.Fatal("normal key must not match")
	}
}
