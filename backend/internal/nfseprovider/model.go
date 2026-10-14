package nfseprovider

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Route é a decisão de roteamento de uma NFS-e: provedor + configuração
// efetiva (catálogo do município com os overrides da empresa por cima).
// É congelada em organization_nfse no handoff ao gateway.
type Route struct {
	ProviderCode     string         `json:"provider_code"`
	Config           map[string]any `json:"provider_config"`
	MunicipalityCode string         `json:"municipality_code,omitempty"`
	// Source: "company_force_route" | "municipal_catalog" | "default".
	Source string `json:"source"`
}

// IsDefault indica que a nota segue para a SEFIN Nacional sem configuração.
func (r Route) IsDefault() bool { return NormalizeCode(r.ProviderCode) == CodeSefinNacional }

// MunicipalProvider é uma linha do catálogo global nfse_municipal_providers.
type MunicipalProvider struct {
	IBGEMunicipalityCode string          `json:"ibge_municipality_code"`
	MunicipalityName     string          `json:"municipality_name"`
	UF                   string          `json:"uf"`
	ProviderCode         string          `json:"provider_code"`
	ProviderName         string          `json:"provider_name,omitempty"`
	ProviderConfig       json.RawMessage `json:"provider_config"`
	Enabled              bool            `json:"enabled"`
	Notes                *string         `json:"notes,omitempty"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// CompanySettings é a configuração de uma empresa para um provedor. A senha
// nunca sai daqui: só HasPassword.
type CompanySettings struct {
	ID                    uuid.UUID       `json:"id"`
	OrganizationID        uuid.UUID       `json:"organization_id"`
	OrganizationCompanyID uuid.UUID       `json:"organization_company_id"`
	ProviderCode          string          `json:"provider_code"`
	Username              *string         `json:"username,omitempty"`
	HasPassword           bool            `json:"has_password"`
	ConfigOverrides       json.RawMessage `json:"config_overrides"`
	ForceRoute            bool            `json:"force_route"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

// UpsertSettingsInput grava credencial/overrides. Password nil mantém a
// senha atual; ponteiro para "" apaga.
type UpsertSettingsInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	ProviderCode          string
	Username              *string
	Password              *string
	ConfigOverrides       map[string]any
	ForceRoute            *bool
	ActorUserID           uuid.UUID
}

// Credentials é o que o internal_api entrega ao gateway.
type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// MergeConfig aplica overrides (chave a chave) sobre a configuração base.
func MergeConfig(base, overrides map[string]any) map[string]any {
	out := make(map[string]any, len(base)+len(overrides))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

// ResolveRoute é a regra pura de roteamento (sem banco), testável:
//  1. settings da empresa com force_route → esse provedor;
//  2. catálogo do município habilitado → provedor do catálogo;
//  3. senão SEFIN Nacional.
//
// Em 1 e 2 os config_overrides da empresa para o provedor escolhido são
// aplicados por cima da configuração do catálogo (quando o provedor é o mesmo).
func ResolveRoute(municipalityCode string, catalog *MunicipalProvider, settings []CompanySettings) Route {
	byProvider := map[string]CompanySettings{}
	var forced *CompanySettings
	for i := range settings {
		s := settings[i]
		code := NormalizeCode(s.ProviderCode)
		byProvider[code] = s
		if s.ForceRoute && forced == nil {
			forced = &settings[i]
		}
	}

	catalogCode := ""
	catalogConfig := map[string]any{}
	if catalog != nil && catalog.Enabled {
		catalogCode = NormalizeCode(catalog.ProviderCode)
		_ = json.Unmarshal(catalog.ProviderConfig, &catalogConfig)
	}

	overridesFor := func(code string) map[string]any {
		out := map[string]any{}
		if s, ok := byProvider[code]; ok && len(s.ConfigOverrides) > 0 {
			_ = json.Unmarshal(s.ConfigOverrides, &out)
		}
		return out
	}

	if forced != nil {
		code := NormalizeCode(forced.ProviderCode)
		base := map[string]any{}
		if code == catalogCode {
			base = catalogConfig
		}
		return Route{
			ProviderCode:     code,
			Config:           MergeConfig(base, overridesFor(code)),
			MunicipalityCode: municipalityCode,
			Source:           "company_force_route",
		}
	}
	if catalogCode != "" {
		return Route{
			ProviderCode:     catalogCode,
			Config:           MergeConfig(catalogConfig, overridesFor(catalogCode)),
			MunicipalityCode: municipalityCode,
			Source:           "municipal_catalog",
		}
	}
	return Route{
		ProviderCode:     CodeSefinNacional,
		Config:           map[string]any{},
		MunicipalityCode: municipalityCode,
		Source:           "default",
	}
}
