package nfseprovider_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/nfseprovider"
)

const garuva = "4205803"

func garuvaCatalog(enabled bool) *nfseprovider.MunicipalProvider {
	return &nfseprovider.MunicipalProvider{
		IBGEMunicipalityCode: garuva,
		MunicipalityName:     "Garuva",
		UF:                   "SC",
		ProviderCode:         "ipm",
		ProviderConfig:       json.RawMessage(`{"base_url":"https://garuva.atende.net/ws","serie_nfse":"1","item_lista_format":"nacional_6"}`),
		Enabled:              enabled,
	}
}

func TestResolveRouteDefaultsToSefinNacional(t *testing.T) {
	t.Parallel()
	route := nfseprovider.ResolveRoute("3550308", nil, nil)
	if route.ProviderCode != nfseprovider.CodeSefinNacional || route.Source != "default" || !route.IsDefault() {
		t.Fatalf("got %+v", route)
	}
}

func TestResolveRouteUsesMunicipalCatalog(t *testing.T) {
	t.Parallel()
	route := nfseprovider.ResolveRoute(garuva, garuvaCatalog(true), nil)
	if route.ProviderCode != "ipm" || route.Source != "municipal_catalog" {
		t.Fatalf("got %+v", route)
	}
	if route.Config["base_url"] != "https://garuva.atende.net/ws" {
		t.Fatalf("config not carried: %+v", route.Config)
	}
}

func TestResolveRouteIgnoresDisabledCatalog(t *testing.T) {
	t.Parallel()
	route := nfseprovider.ResolveRoute(garuva, garuvaCatalog(false), nil)
	if route.ProviderCode != nfseprovider.CodeSefinNacional {
		t.Fatalf("disabled catalog must fall back to SEFIN, got %+v", route)
	}
}

func TestResolveRouteAppliesCompanyOverrides(t *testing.T) {
	t.Parallel()
	settings := []nfseprovider.CompanySettings{{
		ID:              uuid.New(),
		ProviderCode:    "ipm",
		ConfigOverrides: json.RawMessage(`{"serie_nfse":"2","assinatura":true}`),
	}}
	route := nfseprovider.ResolveRoute(garuva, garuvaCatalog(true), settings)
	if route.Config["serie_nfse"] != "2" || route.Config["assinatura"] != true {
		t.Fatalf("overrides not applied: %+v", route.Config)
	}
	if route.Config["base_url"] != "https://garuva.atende.net/ws" {
		t.Fatalf("catalog base lost: %+v", route.Config)
	}
}

func TestResolveRouteForceRouteBeatsCatalog(t *testing.T) {
	t.Parallel()
	settings := []nfseprovider.CompanySettings{{
		ProviderCode: "sefin_nacional",
		ForceRoute:   true,
	}}
	route := nfseprovider.ResolveRoute(garuva, garuvaCatalog(true), settings)
	if route.ProviderCode != nfseprovider.CodeSefinNacional || route.Source != "company_force_route" {
		t.Fatalf("got %+v", route)
	}
	if len(route.Config) != 0 {
		t.Fatalf("catalog config of another provider must not leak: %+v", route.Config)
	}
}

func TestDescriptors(t *testing.T) {
	t.Parallel()
	ipm, ok := nfseprovider.Lookup("IPM")
	if !ok || ipm.IdentifiesBy != nfseprovider.IdentifiesByNumber || ipm.Credentials != nfseprovider.CredentialsBasic {
		t.Fatalf("ipm descriptor: %+v %v", ipm, ok)
	}
	sefin, ok := nfseprovider.Lookup("")
	if !ok || sefin.Code != nfseprovider.CodeSefinNacional || sefin.IdentifiesBy != nfseprovider.IdentifiesByAccessKey {
		t.Fatalf("default descriptor: %+v %v", sefin, ok)
	}
	if _, ok := nfseprovider.Lookup("betha"); ok {
		t.Fatal("unknown provider must not resolve")
	}
	if got := nfseprovider.Descriptors(); len(got) < 2 || got[0].Code != nfseprovider.CodeSefinNacional {
		t.Fatalf("descriptors order: %+v", got)
	}
}

func TestTransmissionResultCarriesProviderFields(t *testing.T) {
	t.Parallel()
	payload := []byte(`{"specversion":"1.0","organization_id":"` + uuid.NewString() + `","data":{
		"document_id":"` + uuid.NewString() + `","outcome":"authorized","number":"457",
		"verification_code":"ABCD","provider_code":"ipm",
		"pdf_url":"https://garuva.atende.net/nfse.pdf","pdf_object_key":"k.provider_pdf.pdf"}}`)
	_, result, err := fiscal.ParseTransmissionResult(payload)
	if err != nil {
		t.Fatal(err)
	}
	if result.ProviderCode != "ipm" || result.PDFURL == "" || result.PDFObjectKey != "k.provider_pdf.pdf" || result.Number != "457" {
		t.Fatalf("got %+v", result)
	}
}
