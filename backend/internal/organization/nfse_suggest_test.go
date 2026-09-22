package organization

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
)

func TestParseLLMSuggestPayload(t *testing.T) {
	t.Parallel()
	raw := "```json\n{\"codigo_nbs\":\"1.0901.12.00\",\"item_lista_servico\":\"1.07\",\"discriminacao\":\"Prestação de suporte.\",\"rationale\":\"ok\",\"confidence\":0.9}\n```"
	got, err := parseLLMSuggestPayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.CodigoNBS != "1.0901.12.00" || got.ItemListaServico != "1.07" {
		t.Fatalf("unexpected payload: %+v", got)
	}
}

func TestValidateSuggestAgainstCandidates(t *testing.T) {
	t.Parallel()
	nbsSet := map[string]catalogs.NBS{
		"1.0901.12.00": {Code: "1.0901.12.00", Description: "Suporte"},
	}
	lcSet := map[string]catalogs.LC116{
		"1.07":                 {Code: "1.07", Description: "Suporte técnico"},
		normalizeLC116("1.07"): {Code: "1.07", Description: "Suporte técnico"},
	}

	ok, valid := validateSuggestAgainstCandidates(llmSuggestPayload{
		CodigoNBS:        "1.0901.12.00",
		ItemListaServico: "1.07",
		Discriminacao:    "Prestação de suporte técnico mensal.",
		Rationale:        "Histórico",
		Confidence:       0.8,
	}, nbsSet, lcSet)
	if !valid || ok == nil {
		t.Fatal("expected valid suggestion")
	}
	if ok.Source != "llm" || ok.CodigoNBS != "1.0901.12.00" {
		t.Fatalf("unexpected result: %+v", ok)
	}

	_, valid = validateSuggestAgainstCandidates(llmSuggestPayload{
		CodigoNBS:        "9.9999.99.99",
		ItemListaServico: "1.07",
		Discriminacao:    "x",
	}, nbsSet, lcSet)
	if valid {
		t.Fatal("expected invalid NBS to fail")
	}
}

func TestSanitizeDiscrimination(t *testing.T) {
	t.Parallel()
	got := sanitizeDiscrimination("  <b>Prestação</b> de suporte  ")
	if got != "Prestação de suporte" {
		t.Fatalf("got %q", got)
	}
}
