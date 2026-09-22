package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/platform/viacep"
)

func (a *ControlPlane) lookupCEP(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:create"); err != nil {
		// company managers also edit address on company settings
		if err2 := a.ensureOrganizationPermission(r, orgID, "company:manage"); err2 != nil {
			writeErr(w, r, err)
			return
		}
	}
	addr, err := viacep.NewClient().Lookup(r.Context(), chi.URLParam(r, "cep"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, addr)
}

func (a *ControlPlane) searchCatalogCNAE(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCatalogAccess(r); err != nil {
		writeErr(w, r, err)
		return
	}
	store, err := catalogs.Get()
	if err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query().Get("q")
	limit := catalogLimit(r, 40)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": store.SearchCNAE(q, limit)})
}

func (a *ControlPlane) searchCatalogNBS(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCatalogAccess(r); err != nil {
		writeErr(w, r, err)
		return
	}
	store, err := catalogs.Get()
	if err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query().Get("q")
	cnae := r.URL.Query().Get("cnae")
	lc116 := r.URL.Query().Get("lc116")
	suggestedOnly := strings.EqualFold(r.URL.Query().Get("suggested_only"), "true") || r.URL.Query().Get("suggested_only") == "1"
	limit := catalogLimit(r, 50)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":              store.SearchNBS(q, cnae, lc116, suggestedOnly, limit),
		"suggested_prefixes": store.NBSPrefixesForCNAE(cnae),
	})
}

func (a *ControlPlane) searchCatalogLC116(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCatalogAccess(r); err != nil {
		writeErr(w, r, err)
		return
	}
	store, err := catalogs.Get()
	if err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query().Get("q")
	cnae := r.URL.Query().Get("cnae")
	nbs := r.URL.Query().Get("nbs")
	suggestedOnly := strings.EqualFold(r.URL.Query().Get("suggested_only"), "true") || r.URL.Query().Get("suggested_only") == "1"
	limit := catalogLimit(r, 50)
	suggested := store.LC116CodesForNBS(nbs)
	if len(suggested) == 0 {
		suggested = store.LC116CodesForCNAE(cnae)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":           store.SearchLC116(q, cnae, nbs, suggestedOnly, limit),
		"suggested_codes": suggested,
	})
}

func (a *ControlPlane) searchCatalogMunicipalities(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCatalogAccess(r); err != nil {
		writeErr(w, r, err)
		return
	}
	store, err := catalogs.Get()
	if err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query().Get("q")
	uf := r.URL.Query().Get("uf")
	limit := catalogLimit(r, 40)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": store.SearchMunicipalities(q, uf, limit)})
}

func (a *ControlPlane) getCatalogMunicipality(w http.ResponseWriter, r *http.Request) {
	if err := a.requireCatalogAccess(r); err != nil {
		writeErr(w, r, err)
		return
	}
	store, err := catalogs.Get()
	if err != nil {
		writeErr(w, r, err)
		return
	}
	item, ok := store.LookupMunicipality(chi.URLParam(r, "code"))
	if !ok {
		writeErr(w, r, domainerr.NotFound("municipality_not_found", "Municipality not found"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) listCompanyCNAEs(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:read"); err != nil {
		if err2 := a.ensureOrganizationPermission(r, orgID, "company:manage"); err2 != nil {
			writeErr(w, r, err)
			return
		}
	}
	items, err := a.Orgs.ListCompanyCNAEs(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) updateCompanyCNAE(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	cnaeID, err := uuid.Parse(chi.URLParam(r, "cnae_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_cnae_id", "Invalid cnae_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Enabled *bool `json:"enabled"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if body.Enabled == nil {
		writeErr(w, r, domainerr.Validation("invalid_enabled", "enabled is required"))
		return
	}
	item, err := a.Orgs.UpdateCompanyCNAEEnabled(r.Context(), orgID, companyID, cnaeID, *body.Enabled, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, item)
}

func (a *ControlPlane) syncCompanyCNAEs(w http.ResponseWriter, r *http.Request) {
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
	items, err := a.Orgs.SyncCompanyCNAEsFromCNPJ(r.Context(), orgID, companyID, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) requireCatalogAccess(r *http.Request) error {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:read"); err == nil {
		return nil
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err == nil {
		return nil
	}
	return a.ensureOrganizationPermission(r, orgID, "nfse:create")
}

func catalogLimit(r *http.Request, fallback int) int {
	raw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return fallback
	}
	if n > 100 {
		return 100
	}
	return n
}
