package organization_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestValidCNPJ(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		cnpj  string
		valid bool
	}{
		{name: "valid", cnpj: "11222333000181", valid: true},
		{name: "repeated_digits", cnpj: "11111111111111", valid: false},
		{name: "short", cnpj: "123", valid: false},
		{name: "invalid_checksum", cnpj: "11222333000180", valid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := organization.ValidCNPJ(tt.cnpj); got != tt.valid {
				t.Fatalf("ValidCNPJ(%q)=%v want %v", tt.cnpj, got, tt.valid)
			}
		})
	}
}

func TestNormalizeCNPJ(t *testing.T) {
	t.Parallel()
	if got := organization.NormalizeCNPJ("11.222.333/0001-81"); got != "11222333000181" {
		t.Fatalf("got %q", got)
	}
}

func TestValidateCompanyInput(t *testing.T) {
	t.Parallel()

	t.Run("ok", func(t *testing.T) {
		t.Parallel()
		cnpj, env, uf, err := organization.ValidateCompanyInput(organization.CreateCompanyInput{
			LegalName: "ACME", CNPJ: "11.222.333/0001-81", Environment: "",
		})
		if err != nil {
			t.Fatal(err)
		}
		if cnpj != "11222333000181" || env != "homologation" || uf != "" {
			t.Fatalf("unexpected cnpj/env/uf: %s %s %s", cnpj, env, uf)
		}
	})

	t.Run("invalid_cnpj", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := organization.ValidateCompanyInput(organization.CreateCompanyInput{
			LegalName: "ACME", CNPJ: "123",
		})
		helpers.AssertDomainCode(t, err, "invalid_cnpj")
		helpers.AssertDomainStatus(t, err, 422)
	})

	t.Run("invalid_environment", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := organization.ValidateCompanyInput(organization.CreateCompanyInput{
			LegalName: "ACME", CNPJ: "11222333000181", Environment: "staging",
		})
		helpers.AssertDomainCode(t, err, "invalid_environment")
	})

	t.Run("uf_normalized_to_uppercase", func(t *testing.T) {
		t.Parallel()
		_, _, uf, err := organization.ValidateCompanyInput(organization.CreateCompanyInput{
			LegalName: "ACME", CNPJ: "11222333000181", UF: " sp ",
		})
		if err != nil {
			t.Fatal(err)
		}
		if uf != "SP" {
			t.Fatalf("uf=%s, want SP", uf)
		}
	})

	t.Run("invalid_uf", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := organization.ValidateCompanyInput(organization.CreateCompanyInput{
			LegalName: "ACME", CNPJ: "11222333000181", UF: "ZZ",
		})
		helpers.AssertDomainCode(t, err, "invalid_uf")
	})
}

func TestValidateUpdateCompanyInput(t *testing.T) {
	t.Parallel()

	t.Run("ok_sets_uf_that_was_missing", func(t *testing.T) {
		t.Parallel()
		legalName, uf, env, err := organization.ValidateUpdateCompanyInput(organization.UpdateCompanyDetailsInput{
			LegalName: "LS Mtron Brasil", UF: "es", Environment: "homologation",
		})
		if err != nil {
			t.Fatal(err)
		}
		if legalName != "LS Mtron Brasil" || uf != "ES" || env != "homologation" {
			t.Fatalf("unexpected legalName/uf/env: %s %s %s", legalName, uf, env)
		}
	})

	t.Run("invalid_uf", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := organization.ValidateUpdateCompanyInput(organization.UpdateCompanyDetailsInput{
			LegalName: "ACME", UF: "XX",
		})
		helpers.AssertDomainCode(t, err, "invalid_uf")
	})

	t.Run("requires_legal_name", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := organization.ValidateUpdateCompanyInput(organization.UpdateCompanyDetailsInput{
			LegalName: "  ", UF: "SP",
		})
		helpers.AssertDomainCode(t, err, "invalid_company")
	})
}

func TestValidateOrganizationInput(t *testing.T) {
	t.Parallel()

	slug, err := organization.ValidateOrganizationInput(organization.CreateOrganizationInput{
		LegalName: "ACME", Slug: " ACME-Org ", OwnerUserID: uuid.New(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if slug != "acme-org" {
		t.Fatalf("slug=%q", slug)
	}

	_, err = organization.ValidateOrganizationInput(organization.CreateOrganizationInput{
		LegalName: "", Slug: "x",
	})
	helpers.AssertDomainCode(t, err, "invalid_organization")
}

func TestValidateUpdateOrganizationInput(t *testing.T) {
	t.Parallel()

	_, err := organization.ValidateUpdateOrganizationInput(organization.UpdateOrganizationInput{
		LegalName: "ACME Ltda", TradeName: "ACME", Timezone: "America/Sao_Paulo", DefaultLocale: "pt-BR",
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = organization.ValidateUpdateOrganizationInput(organization.UpdateOrganizationInput{LegalName: ""})
	helpers.AssertDomainCode(t, err, "invalid_organization")

	_, err = organization.ValidateUpdateOrganizationInput(organization.UpdateOrganizationInput{
		LegalName: "ACME", Timezone: "Not/AZone",
	})
	helpers.AssertDomainCode(t, err, "invalid_timezone")

	_, err = organization.ValidateUpdateOrganizationInput(organization.UpdateOrganizationInput{
		LegalName: "ACME", DefaultLocale: "es-ES",
	})
	helpers.AssertDomainCode(t, err, "invalid_locale")
}

func TestDefaultAPIClientScopes(t *testing.T) {
	t.Parallel()
	got := organization.DefaultAPIClientScopes(nil)
	if len(got) != 2 {
		t.Fatalf("expected defaults, got %#v", got)
	}
	custom := organization.DefaultAPIClientScopes([]string{"fiscal_documents:create"})
	if len(custom) != 1 || custom[0] != "fiscal_documents:create" {
		t.Fatalf("unexpected %#v", custom)
	}

	_, err := organization.NormalizeAPIClientScopes([]string{"unknown:scope"})
	helpers.AssertDomainCode(t, err, "invalid_scope")
}
