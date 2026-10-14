package httpapi

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/nexus/fiscal-messaging/internal/nfseprovider"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// Provedores municipais de NFS-e — catálogo (somente leitura) e configuração
// por empresa (credencial do webservice da prefeitura, overrides, force_route).
// Ver docs/architecture/25_nfse_provedores_municipais.md.

func (a *ControlPlane) nfseProvidersReady(w http.ResponseWriter, r *http.Request) bool {
	if a.NFSeProviders == nil {
		writeErr(w, r, domainerr.New(503, "nfse_providers_unconfigured", "Service Unavailable", "NFS-e provider settings are not configured"))
		return false
	}
	return true
}

// GET /v1/nfse/municipal-providers
func (a *ControlPlane) listNFSeMunicipalProviders(w http.ResponseWriter, r *http.Request) {
	if !a.nfseProvidersReady(w, r) {
		return
	}
	items, err := a.NFSeProviders.ListMunicipal(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":     items,
		"providers": nfseprovider.Descriptors(),
	})
}

// GET /v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings
// Lista as configurações da empresa e a rota que uma NFS-e emitida no
// município da empresa tomaria hoje.
func (a *ControlPlane) listCompanyNFSeProviderSettings(w http.ResponseWriter, r *http.Request) {
	if !a.nfseProvidersReady(w, r) {
		return
	}
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.NFSeProviders.ListCompanySettings(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	out := map[string]any{"items": items}
	if company, err := a.Orgs.GetCompany(r.Context(), orgID, companyID); err == nil && company != nil {
		municipio := ""
		if company.IBGEMunicipalityCode != nil {
			municipio = strings.TrimSpace(*company.IBGEMunicipalityCode)
		}
		if route, err := a.NFSeProviders.Resolve(r.Context(), orgID, companyID, municipio); err == nil {
			out["route"] = route
		}
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

// PUT /v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings/{provider_code}
// Corpo: {"username": "...", "password": "...", "config_overrides": {...}, "force_route": false}
// Campos ausentes mantêm o valor atual; "password": "" apaga a senha.
func (a *ControlPlane) upsertCompanyNFSeProviderSettings(w http.ResponseWriter, r *http.Request) {
	if !a.nfseProvidersReady(w, r) {
		return
	}
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Username        *string        `json:"username"`
		Password        *string        `json:"password"`
		ConfigOverrides map[string]any `json:"config_overrides"`
		ForceRoute      *bool          `json:"force_route"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	settings, err := a.NFSeProviders.UpsertCompanySettings(r.Context(), nfseprovider.UpsertSettingsInput{
		OrganizationID:        orgID,
		OrganizationCompanyID: companyID,
		ProviderCode:          chi.URLParam(r, "provider_code"),
		Username:              body.Username,
		Password:              body.Password,
		ConfigOverrides:       body.ConfigOverrides,
		ForceRoute:            body.ForceRoute,
		ActorUserID:           p.UserID,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settings)
}

// DELETE /v1/organizations/{organization_id}/companies/{company_id}/nfse-provider-settings/{provider_code}
func (a *ControlPlane) deleteCompanyNFSeProviderSettings(w http.ResponseWriter, r *http.Request) {
	if !a.nfseProvidersReady(w, r) {
		return
	}
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.NFSeProviders.DeleteCompanySettings(r.Context(), orgID, companyID, chi.URLParam(r, "provider_code"), p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
