package billing_test

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/billing"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestClassifyDocument(t *testing.T) {
	t.Parallel()

	cases := []struct {
		docType, direction, source, want string
	}{
		{"nfe", "outbound", "sap", billing.MetricNFeOutbound},
		{"nfe", "inbound", "manual_upload", billing.MetricNFeInboundXML},
		{"nfe", "inbound", "nfe_gateway_distribution", billing.MetricNFeInboundSEFAZ},
		{"nfe", "inbound", "nfe_gateway_query", billing.MetricNFeInboundSEFAZ},
		{"nfe", "inbound", "sap", billing.MetricNFeInboundOther},
		{"nfse", "outbound", "sap", billing.MetricNFSeOutbound},
		{"nfse", "inbound", "manual_upload", billing.MetricNFSeInbound},
		{"cte", "outbound", "sap", billing.MetricOther},
	}
	for _, tc := range cases {
		got := billing.ClassifyDocument(tc.docType, tc.direction, tc.source)
		if got != tc.want {
			t.Fatalf("ClassifyDocument(%q,%q,%q)=%q want %q", tc.docType, tc.direction, tc.source, got, tc.want)
		}
	}
}

func TestClassifyDocumentEvent(t *testing.T) {
	t.Parallel()

	if got := billing.ClassifyDocumentEvent("fiscal.document.cancelled.v1", ""); got != billing.MetricNFeCancel {
		t.Fatalf("cancel=%q", got)
	}
	if got := billing.ClassifyDocumentEvent("carta_correcao", ""); got != billing.MetricNFeCorrection {
		t.Fatalf("cce=%q", got)
	}
	if got := billing.ClassifyDocumentEvent("manifestacao", "confirmacao_da_operacao"); got != billing.MetricNFeAccept {
		t.Fatalf("accept=%q", got)
	}
	if got := billing.ClassifyDocumentEvent("manifestacao", "operacao_nao_realizada"); got != billing.MetricNFeReject {
		t.Fatalf("reject=%q", got)
	}
	if got := billing.ClassifyDocumentEvent("received", ""); got != "" {
		t.Fatalf("noise=%q", got)
	}
}

func TestParsePeriod(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 24, 15, 0, 0, 0, time.UTC)

	t.Run("defaults_to_current_month", func(t *testing.T) {
		t.Parallel()
		from, to, err := billing.ParsePeriod("", "", now)
		if err != nil {
			t.Fatal(err)
		}
		if from.Month() != time.August || from.Day() != 1 {
			t.Fatalf("from=%s", from)
		}
		if to.Month() != time.September || to.Day() != 1 {
			t.Fatalf("to=%s", to)
		}
	})

	t.Run("explicit_inclusive_range", func(t *testing.T) {
		t.Parallel()
		from, to, err := billing.ParsePeriod("2026-07-01", "2026-07-31", now)
		if err != nil {
			t.Fatal(err)
		}
		if from.Day() != 1 || to.Month() != time.August || to.Day() != 1 {
			t.Fatalf("from=%s to=%s", from, to)
		}
	})

	t.Run("to_before_from", func(t *testing.T) {
		t.Parallel()
		_, _, err := billing.ParsePeriod("2026-08-01", "2026-07-01", now)
		helpers.AssertDomainCode(t, err, "invalid_period")
	})

	t.Run("only_one_bound", func(t *testing.T) {
		t.Parallel()
		_, _, err := billing.ParsePeriod("2026-07-01", "", now)
		helpers.AssertDomainCode(t, err, "invalid_period")
	})
}

func TestNovaIssuer(t *testing.T) {
	t.Parallel()

	issuer := billing.NovaConsulting
	if issuer.Email != "ti@novaconsulting.com.br" {
		t.Fatalf("email=%q", issuer.Email)
	}
	if issuer.LegalName != "Nova Consultoria em Tecnologia da Informação Ltda" {
		t.Fatalf("legal_name=%q", issuer.LegalName)
	}
	if len(issuer.AddressLines) != 0 || issuer.City != "" || issuer.PostalCode != "" || issuer.Country != "" {
		t.Fatalf("address should be empty: %+v", issuer)
	}
}

func TestRenderPDF(t *testing.T) {
	t.Parallel()

	trade := "Acme"
	tax := "12345678000199"
	stmt := &billing.Statement{
		OrganizationID: uuid.New(),
		LegalName:      "Acme Industria Ltda",
		TradeName:      &trade,
		Slug:           "acme",
		TaxIdentifier:  &tax,
		PeriodFrom:     time.Date(2026, 7, 1, 3, 0, 0, 0, time.UTC),
		PeriodTo:       time.Date(2026, 7, 31, 3, 0, 0, 0, time.UTC),
		IssuedAt:       time.Date(2026, 8, 24, 12, 0, 0, 0, time.UTC),
		TotalQuantity:  37,
		Issuer:         billing.NovaConsulting,
		Totals: []billing.MetricQuantity{
			{Code: billing.MetricNFeOutbound, Label: "Notas fiscais de saída", Unit: billing.UnitMessage, Quantity: 20},
			{Code: billing.MetricNFeInboundSEFAZ, Label: "Notas fiscais de entrada (SEFAZ)", Unit: billing.UnitMessage, Quantity: 17},
		},
		Companies: []billing.CompanyStatement{
			{
				CompanyID:     uuid.New(),
				LegalName:     "Acme Matriz",
				CNPJ:          "12345678000199",
				TotalQuantity: 37,
				Metrics: []billing.MetricQuantity{
					{Code: billing.MetricNFeOutbound, Label: "Notas fiscais de saída", Unit: billing.UnitMessage, Quantity: 20},
					{Code: billing.MetricNFeInboundSEFAZ, Label: "Notas fiscais de entrada (SEFAZ)", Unit: billing.UnitMessage, Quantity: 17},
				},
			},
		},
	}

	svc := &billing.Service{}
	pdf, filename, err := svc.RenderPDF(stmt)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(pdf[:8]), "%PDF") {
		t.Fatalf("not a PDF: %q", pdf[:8])
	}
	if !strings.Contains(filename, "acme") || !strings.HasSuffix(filename, ".pdf") {
		t.Fatalf("filename=%q", filename)
	}
	if len(pdf) < 15000 {
		t.Fatalf("pdf too small: %d", len(pdf))
	}
}
