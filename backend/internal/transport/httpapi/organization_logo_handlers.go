package httpapi

import (
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) uploadOrganizationLogo(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "organization:update"); err != nil {
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
	org, err := a.Orgs.SetOrganizationLogo(r.Context(), orgID, p.UserID, data)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, org)
}

func (a *ControlPlane) deleteOrganizationLogo(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "organization:update"); err != nil {
		writeErr(w, r, err)
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	org, err := a.Orgs.DeleteOrganizationLogo(r.Context(), orgID, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, org)
}

func (a *ControlPlane) getOrganizationLogo(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	data, ct, err := a.Orgs.GetOrganizationLogo(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, no-cache")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
