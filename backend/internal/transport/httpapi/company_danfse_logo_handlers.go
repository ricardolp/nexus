package httpapi

import (
	"context"
	"io"
	"net/http"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

type companyLogoSetter func(ctx context.Context, orgID, companyID, actorID uuid.UUID, data []byte) (*organization.Company, error)

type companyLogoDeleter func(ctx context.Context, orgID, companyID, actorID uuid.UUID) (*organization.Company, error)

type companyLogoGetter func(ctx context.Context, orgID, companyID uuid.UUID) ([]byte, string, error)

func (a *ControlPlane) uploadCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
	a.uploadCompanyLogo(w, r, a.Orgs.SetCompanyDanfseLogo)
}

func (a *ControlPlane) deleteCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
	a.deleteCompanyLogo(w, r, a.Orgs.DeleteCompanyDanfseLogo)
}

func (a *ControlPlane) getCompanyDanfseLogo(w http.ResponseWriter, r *http.Request) {
	a.getCompanyLogo(w, r, a.Orgs.GetCompanyDanfseLogo)
}

func (a *ControlPlane) uploadCompanyDanfeLogo(w http.ResponseWriter, r *http.Request) {
	a.uploadCompanyLogo(w, r, a.Orgs.SetCompanyDanfeLogo)
}

func (a *ControlPlane) deleteCompanyDanfeLogo(w http.ResponseWriter, r *http.Request) {
	a.deleteCompanyLogo(w, r, a.Orgs.DeleteCompanyDanfeLogo)
}

func (a *ControlPlane) getCompanyDanfeLogo(w http.ResponseWriter, r *http.Request) {
	a.getCompanyLogo(w, r, a.Orgs.GetCompanyDanfeLogo)
}

func (a *ControlPlane) uploadCompanyLogo(w http.ResponseWriter, r *http.Request, set companyLogoSetter) {
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
	company, err := set(r.Context(), orgID, companyID, p.UserID, data)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

func (a *ControlPlane) deleteCompanyLogo(w http.ResponseWriter, r *http.Request, del companyLogoDeleter) {
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
	company, err := del(r.Context(), orgID, companyID, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, company)
}

func (a *ControlPlane) getCompanyLogo(w http.ResponseWriter, r *http.Request, get companyLogoGetter) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	data, ct, err := get(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
