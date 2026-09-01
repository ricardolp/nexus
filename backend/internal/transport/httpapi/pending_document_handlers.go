package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// --- pending manifestation documents (resNFe/resEvento/procEventoNFe
// summaries found by the nfe-gateway but not yet fully ingestable — see
// migration 019 and internal/fiscal/pending_document_model.go) ---

func (a *ControlPlane) listPendingFiscalDocuments(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	limit, err := parseLimitParam(r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.PendingDocuments.List(r.Context(), orgID, limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) requestFiscalDocumentManifestation(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	pendingDocumentID, err := uuid.Parse(chi.URLParam(r, "pending_document_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_pending_document_id", "Invalid pending_document_id"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	req, err := a.PendingDocuments.RequestManifestation(r.Context(), orgID, companyID, pendingDocumentID, p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, req)
}
