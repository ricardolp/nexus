package faq

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestNormalizeSourceAndCode(t *testing.T) {
	t.Parallel()
	src, err := normalizeSource(" sefaz ")
	if err != nil || src != SourceSEFAZ {
		t.Fatalf("normalizeSource: got %q %v", src, err)
	}
	if _, err := normalizeSource("FOO"); err == nil {
		t.Fatal("expected invalid source")
	}
	code, err := normalizeCode(" 205 ")
	if err != nil || code != "205" {
		t.Fatalf("normalizeCode: got %q %v", code, err)
	}
	if _, err := normalizeCode(" "); err == nil {
		t.Fatal("expected empty code error")
	}
}

func TestTruncateRunes(t *testing.T) {
	t.Parallel()
	in := stringsRepeat("á", 510)
	out := truncateRunes(in, 500)
	if len([]rune(out)) != 500 {
		t.Fatalf("want 500 runes, got %d", len([]rune(out)))
	}
}

func stringsRepeat(s string, n int) string {
	out := make([]rune, 0, n)
	r := []rune(s)[0]
	for i := 0; i < n; i++ {
		out = append(out, r)
	}
	return string(out)
}

func TestBuildLookupResultFoundAndMissing(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)
	slug := "sefaz-205"
	msg := &Message{
		ID:                uuid.MustParse("01900000-0000-7000-8000-000000000205"),
		Source:            SourceSEFAZ,
		Code:              "205",
		Docsta:            "3",
		Lang:              DefaultLang,
		Severity:          SeverityDenied,
		Title:             "Uso denegado pela SEFAZ",
		Summary:           "Negado definitivamente.",
		Steps:             []string{"Estornar", "Corrigir"},
		ForbiddenActions:  []string{"Reinicializar documento"},
		RecommendedAction: ActionReverseSource,
		FAQSlug:           &slug,
		Active:            true,
		UpdatedAt:         now,
	}

	found := buildLookupResult(SourceSEFAZ, "205", "3", "Rejeicao: ...", msg)
	if !found.Found || found.Severity != SeverityDenied {
		t.Fatalf("unexpected found result: %+v", found)
	}
	if found.Title == nil || *found.Title != msg.Title {
		t.Fatalf("title: %+v", found.Title)
	}
	if found.Docsta == nil || *found.Docsta != "3" {
		t.Fatalf("docsta: %+v", found.Docsta)
	}
	if found.SefazText == nil || *found.SefazText != "Rejeicao: ..." {
		t.Fatalf("sefaz_text: %+v", found.SefazText)
	}
	if found.FAQURL == nil || *found.FAQURL != "/faq/sefaz/sefaz-205" {
		t.Fatalf("faq_url: %+v", found.FAQURL)
	}
	if found.RecommendedAction != ActionReverseSource {
		t.Fatalf("action: %s", found.RecommendedAction)
	}

	missing := buildLookupResult(SourceSEFAZ, "999", "", "", nil)
	if missing.Found {
		t.Fatal("expected found=false")
	}
	if missing.Severity != SeverityUnknown || missing.RecommendedAction != ActionNone {
		t.Fatalf("missing defaults: %+v", missing)
	}
	if missing.Title != nil || missing.Summary != nil || missing.UpdatedAt != nil || missing.FAQURL != nil {
		t.Fatalf("null fields must be nil: %+v", missing)
	}
	if len(missing.Steps) != 0 || len(missing.ForbiddenActions) != 0 {
		t.Fatalf("empty arrays required: %+v", missing)
	}
}

func TestBuildMessageFromInputDefaults(t *testing.T) {
	t.Parallel()
	msg, err := buildMessageFromInput("api", "HTTP_502", " ", "", "technical", "Gateway", "Falha",
		[]string{" Aguardar ", ""}, nil, "", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Source != SourceAPI || msg.Code != "HTTP_502" || msg.Docsta != "" || msg.Lang != DefaultLang {
		t.Fatalf("normalized fields: %+v", msg)
	}
	if msg.Severity != SeverityTechnical || msg.RecommendedAction != ActionNone || !msg.Active {
		t.Fatalf("defaults: %+v", msg)
	}
	if len(msg.Steps) != 1 || msg.Steps[0] != "Aguardar" {
		t.Fatalf("steps: %+v", msg.Steps)
	}
	if msg.ForbiddenActions == nil || len(msg.ForbiddenActions) != 0 {
		t.Fatalf("forbidden must be empty slice: %#v", msg.ForbiddenActions)
	}
}
