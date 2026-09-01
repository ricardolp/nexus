package organization

import (
	"regexp"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

var cnpjDigits = regexp.MustCompile(`^\d{14}$`)
var organizationSlug = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// validUFs is the fixed set of 26 states + DF — used to validate
// organization_companies.uf, which selects the SEFAZ webservice endpoint
// for both NF-e distribution and authorization.
var validUFs = map[string]struct{}{
	"AC": {}, "AL": {}, "AP": {}, "AM": {}, "BA": {}, "CE": {}, "DF": {},
	"ES": {}, "GO": {}, "MA": {}, "MT": {}, "MS": {}, "MG": {}, "PA": {},
	"PB": {}, "PR": {}, "PE": {}, "PI": {}, "RJ": {}, "RN": {}, "RS": {},
	"RO": {}, "RR": {}, "SC": {}, "SP": {}, "SE": {}, "TO": {},
}

const (
	maxNameLength  = 200
	maxSlugLength  = 63
	maxScopesCount = 20
)

var allowedOrganizationLocales = map[string]struct{}{
	"pt-BR": {},
	"en-US": {},
}

// fiscal_documents:create grants both inbound and outbound document
// creation — kept for backward compatibility with clients provisioned
// before the narrower scopes existed. New integrations should request only
// the direction they actually need (least privilege) — e.g. nfe-gateway's
// distribution poller only ever needs fiscal_documents:inbound:create, so a
// leaked credential can't also be used to submit outbound documents.
var allowedAPIClientScopes = map[string]struct{}{
	"fiscal_documents:create":          {},
	"fiscal_documents:read":            {},
	"fiscal_documents:inbound:create":  {},
	"fiscal_documents:outbound:create": {},
}

// NormalizeCNPJ removes formatting and keeps only digits.
func NormalizeCNPJ(v string) string {
	var b strings.Builder
	for _, r := range v {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// ValidCNPJ validates Brazilian CNPJ checksum.
func ValidCNPJ(cnpj string) bool {
	if len(cnpj) != 14 {
		return false
	}
	allSame := true
	for i := 1; i < 14; i++ {
		if cnpj[i] != cnpj[0] {
			allSame = false
			break
		}
	}
	if allSame {
		return false
	}

	calc := func(base string, weights []int) int {
		sum := 0
		for i, w := range weights {
			sum += int(base[i]-'0') * w
		}
		rest := sum % 11
		if rest < 2 {
			return 0
		}
		return 11 - rest
	}

	d1 := calc(cnpj[:12], []int{5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2})
	d2 := calc(cnpj[:12]+string(byte('0'+d1)), []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2})
	return int(cnpj[12]-'0') == d1 && int(cnpj[13]-'0') == d2
}

// ValidateCompanyInput normalizes/validates company creation fields. uf is
// deliberately optional (empty string allowed) — companies predating the
// field, or ones only used for identity/webhook purposes, don't strictly
// need it — but it's required before any real SEFAZ call can be made for
// that company (nfe-gateway has nothing to route on without it).
func ValidateCompanyInput(in CreateCompanyInput) (cnpj string, environment string, uf string, err error) {
	cnpj = NormalizeCNPJ(in.CNPJ)
	if !cnpjDigits.MatchString(cnpj) || !ValidCNPJ(cnpj) {
		return "", "", "", domainerr.Validation("invalid_cnpj", "CNPJ must contain 14 valid digits")
	}
	environment = in.Environment
	if environment == "" {
		environment = "homologation"
	}
	if environment != "production" && environment != "homologation" {
		return "", "", "", domainerr.Validation("invalid_environment", "environment must be production or homologation")
	}
	uf = strings.ToUpper(strings.TrimSpace(in.UF))
	if uf != "" {
		if _, ok := validUFs[uf]; !ok {
			return "", "", "", domainerr.Validation("invalid_uf", "uf must be a valid Brazilian state code")
		}
	}
	legalName := strings.TrimSpace(in.LegalName)
	if legalName == "" {
		return "", "", "", domainerr.Validation("invalid_company", "legal_name is required")
	}
	if len(legalName) > maxNameLength || len(strings.TrimSpace(in.TradeName)) > maxNameLength {
		return "", "", "", domainerr.Validation("invalid_company", "legal_name and trade_name must contain at most 200 characters")
	}
	return cnpj, environment, uf, nil
}

// ValidateUpdateCompanyInput validates cadastral edits (legal_name,
// trade_name, uf, environment) — CNPJ is immutable once a company exists,
// so UpdateCompanyDetailsInput doesn't carry one and there's nothing to
// validate here for it. Mirrors ValidateCompanyInput's checks for the
// fields the two share.
func ValidateUpdateCompanyInput(in UpdateCompanyDetailsInput) (legalName string, uf string, environment string, err error) {
	environment = in.Environment
	if environment == "" {
		environment = "homologation"
	}
	if environment != "production" && environment != "homologation" {
		return "", "", "", domainerr.Validation("invalid_environment", "environment must be production or homologation")
	}
	uf = strings.ToUpper(strings.TrimSpace(in.UF))
	if uf != "" {
		if _, ok := validUFs[uf]; !ok {
			return "", "", "", domainerr.Validation("invalid_uf", "uf must be a valid Brazilian state code")
		}
	}
	legalName = strings.TrimSpace(in.LegalName)
	if legalName == "" {
		return "", "", "", domainerr.Validation("invalid_company", "legal_name is required")
	}
	if len(legalName) > maxNameLength || len(strings.TrimSpace(in.TradeName)) > maxNameLength {
		return "", "", "", domainerr.Validation("invalid_company", "legal_name and trade_name must contain at most 200 characters")
	}
	return legalName, uf, environment, nil
}

func ValidateOrganizationInput(in CreateOrganizationInput) (slug string, err error) {
	slug = strings.ToLower(strings.TrimSpace(in.Slug))
	legalName := strings.TrimSpace(in.LegalName)
	if legalName == "" || slug == "" {
		return "", domainerr.Validation("invalid_organization", "legal_name and slug are required")
	}
	if len(legalName) > maxNameLength || len(strings.TrimSpace(in.TradeName)) > maxNameLength {
		return "", domainerr.Validation("invalid_organization", "legal_name and trade_name must contain at most 200 characters")
	}
	if len(slug) > maxSlugLength || !organizationSlug.MatchString(slug) {
		return "", domainerr.Validation("invalid_slug", "slug must contain only lowercase letters, numbers and single hyphens")
	}
	return slug, nil
}

// ValidateUpdateOrganizationInput validates cadastral edits (legal_name,
// trade_name, tax_identifier) and optional defaults (timezone, locale) —
// unlike creation, slug is immutable and not part of this input.
func ValidateUpdateOrganizationInput(in UpdateOrganizationInput) (legalName string, err error) {
	legalName = strings.TrimSpace(in.LegalName)
	if legalName == "" {
		return "", domainerr.Validation("invalid_organization", "legal_name is required")
	}
	if len(legalName) > maxNameLength || len(strings.TrimSpace(in.TradeName)) > maxNameLength {
		return "", domainerr.Validation("invalid_organization", "legal_name and trade_name must contain at most 200 characters")
	}
	if tz := strings.TrimSpace(in.Timezone); tz != "" {
		if _, err := time.LoadLocation(tz); err != nil {
			return "", domainerr.Validation("invalid_timezone", "timezone must be a valid IANA name")
		}
	}
	if locale := strings.TrimSpace(in.DefaultLocale); locale != "" {
		if _, ok := allowedOrganizationLocales[locale]; !ok {
			return "", domainerr.Validation("invalid_locale", "default_locale must be pt-BR or en-US")
		}
	}
	return legalName, nil
}

func NormalizeAPIClientScopes(scopes []string) ([]string, error) {
	if len(scopes) == 0 {
		return []string{"fiscal_documents:create", "fiscal_documents:read"}, nil
	}
	if len(scopes) > maxScopesCount {
		return nil, domainerr.Validation("invalid_scopes", "at most 20 scopes are allowed")
	}
	normalized := make([]string, 0, len(scopes))
	seen := make(map[string]struct{}, len(scopes))
	for _, value := range scopes {
		scope := strings.TrimSpace(value)
		if _, allowed := allowedAPIClientScopes[scope]; !allowed {
			return nil, domainerr.Validation("invalid_scope", "unsupported API client scope: "+scope)
		}
		if _, duplicate := seen[scope]; duplicate {
			continue
		}
		seen[scope] = struct{}{}
		normalized = append(normalized, scope)
	}
	return normalized, nil
}

func DefaultAPIClientScopes(scopes []string) []string {
	normalized, _ := NormalizeAPIClientScopes(scopes)
	return normalized
}
