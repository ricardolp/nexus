package support_test

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/support"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestResolveEnvironment(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"production":   support.EnvironmentProduction,
		"PRD":          support.EnvironmentProduction,
		"prod":         support.EnvironmentProduction,
		"homologation": support.EnvironmentHomologation,
		"development":  support.EnvironmentHomologation,
		"":             support.EnvironmentHomologation,
		"staging":      support.EnvironmentHomologation,
	}
	for in, want := range cases {
		if got := support.ResolveEnvironment(in); got != want {
			t.Fatalf("ResolveEnvironment(%q)=%q want %q", in, got, want)
		}
	}
}

func TestNormalizePriority(t *testing.T) {
	t.Parallel()

	t.Run("homologation_only_medium", func(t *testing.T) {
		t.Parallel()
		got, err := support.NormalizePriority("medium", support.EnvironmentHomologation)
		if err != nil || got != support.PriorityMedium {
			t.Fatalf("got %q err=%v", got, err)
		}
		_, err = support.NormalizePriority("critical", support.EnvironmentHomologation)
		helpers.AssertDomainCode(t, err, "priority_not_allowed")
		_, err = support.NormalizePriority("high", support.EnvironmentHomologation)
		helpers.AssertDomainCode(t, err, "priority_not_allowed")
	})

	t.Run("production_allows_critical", func(t *testing.T) {
		t.Parallel()
		got, err := support.NormalizePriority("critical", support.EnvironmentProduction)
		if err != nil || got != support.PriorityCritical {
			t.Fatalf("got %q err=%v", got, err)
		}
	})

	t.Run("blank_defaults_medium", func(t *testing.T) {
		t.Parallel()
		got, err := support.NormalizePriority("", support.EnvironmentHomologation)
		if err != nil || got != support.PriorityMedium {
			t.Fatalf("got %q err=%v", got, err)
		}
	})
}

func TestValidateCreateInput(t *testing.T) {
	t.Parallel()

	t.Run("ok", func(t *testing.T) {
		t.Parallel()
		docID := uuid.New()
		subject, html, text, priority, links, err := support.ValidateCreateInput(support.CreateInput{
			OrganizationID: uuid.New(),
			OpenedByUserID: uuid.New(),
			Subject:        "  NF-e travada  ",
			BodyHTML:       "<p>Nota #132 não processou</p>",
			Priority:       " HIGH ",
			DocumentLinks: []support.DocumentLinkInput{
				{DocumentNumber: "132", DocumentType: "nfe", FiscalDocumentID: &docID},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		if subject != "NF-e travada" || html == "" || text != "Nota #132 não processou" || priority != "high" {
			t.Fatalf("subject=%q html=%q text=%q priority=%q", subject, html, text, priority)
		}
		if len(links) != 1 || links[0].DocumentNumber != "132" || links[0].DocumentType != "nfe" {
			t.Fatalf("links=%#v", links)
		}
	})

	t.Run("missing_subject", func(t *testing.T) {
		t.Parallel()
		_, _, _, _, _, err := support.ValidateCreateInput(support.CreateInput{
			OrganizationID: uuid.New(), OpenedByUserID: uuid.New(), BodyHTML: "<p>texto suficiente</p>",
		})
		helpers.AssertDomainCode(t, err, "subject_required")
	})

	t.Run("body_too_short", func(t *testing.T) {
		t.Parallel()
		_, _, _, _, _, err := support.ValidateCreateInput(support.CreateInput{
			OrganizationID: uuid.New(), OpenedByUserID: uuid.New(), Subject: "assunto", BodyHTML: "<p> </p>",
		})
		helpers.AssertDomainCode(t, err, "body_required")
	})
}

func TestNormalizePage(t *testing.T) {
	t.Parallel()
	page, limit := support.NormalizePage(0, 0)
	if page != 1 || limit != support.DefaultListLimit {
		t.Fatalf("page=%d limit=%d", page, limit)
	}
	_, limit = support.NormalizePage(2, support.MaxListLimit+10)
	if limit != support.MaxListLimit {
		t.Fatalf("limit=%d", limit)
	}
}

func TestStripHTML(t *testing.T) {
	t.Parallel()
	got := support.StripHTML(`<p>Olá <script>alert(1)</script><b>mundo</b></p>`)
	if strings.Contains(got, "script") || strings.Contains(got, "<") {
		t.Fatalf("got %q", got)
	}
	if !strings.Contains(got, "Olá") || !strings.Contains(got, "mundo") {
		t.Fatalf("got %q", got)
	}
}

func TestSLAHours(t *testing.T) {
	t.Parallel()
	if support.SLAHours(support.PriorityCritical) != 1 {
		t.Fatal("critical sla")
	}
	if support.SLAHours(support.PriorityMedium) != 48 {
		t.Fatal("medium sla")
	}
}
