package mailer_test

import (
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

func TestRenderLayoutUsesBrandColors(t *testing.T) {
	t.Parallel()

	html, err := mailer.RenderLayout(mailer.LayoutInput{
		Preheader:  "Pré-visualização",
		Title:      "Título do e-mail",
		Greeting:   "Olá,",
		Paragraphs: []string{"Corpo <script>alert(1)</script>"},
		CTALabel:   "Abrir",
		CTAURL:     "https://frontend.example.com/invite?token=abc",
		HelperText: "Ajuda",
		Footer:     "Rodapé",
		LogoURL:    "https://frontend.example.com/brand/nexus-mark.png",
		AppURL:     "https://frontend.example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		mailer.BrandBlue,
		mailer.BrandMagenta,
		mailer.BrandViolet,
		mailer.BrandInk,
		"Título do e-mail",
		"https://frontend.example.com/invite?token=abc",
		"nexus-mark.png",
		"Corpo &lt;script&gt;alert(1)&lt;/script&gt;",
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("layout missing %q", want)
		}
	}
}

func TestLogoURL(t *testing.T) {
	t.Parallel()
	if got := mailer.LogoURL("https://app.example.com/"); got != "https://app.example.com/brand/nexus-mark.png" {
		t.Fatalf("got %q", got)
	}
}
