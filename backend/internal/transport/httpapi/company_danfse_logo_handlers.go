package httpapi

import (
	"io"
	"net/http"

	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) uploadCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "company:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_multipart", "Invalid multipart body"))
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, r, domainerr.Validation("file_required", "file is required"))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 2<<20))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	company, err := a.Orgs.SetCompanyDanfseLogo(r.Context(), orgID, companyID, p.UserID, data)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

func (a *ControlPlane) deleteCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
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
	company, err := a.Orgs.DeleteCompanyDanfseLogo(r.Context(), orgID, companyID, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

func (a *ControlPlane) getCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	data, ct, err := a.Orgs.GetCompanyDanfseLogo(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
