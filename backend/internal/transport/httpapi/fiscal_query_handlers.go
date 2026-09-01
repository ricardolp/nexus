package httpapi

import (
	"archive/zip"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// --- on-demand SEFAZ queries (por NSU, por chave, em lote) ---

func (a *ControlPlane) createFiscalDocumentQuery(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Type   string   `json:"type"`
		NSU    *int64   `json:"nsu"`
		Chaves []string `json:"chaves"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	p, _ := auth.PrincipalFrom(r.Context())
	req, err := a.FiscalQueries.Create(r.Context(), fiscal.CreateQueryInput{
		OrganizationID:        orgID,
		OrganizationCompanyID: companyID,
		RequestedByUserID:     p.UserID,
		QueryType:             body.Type,
		NSU:                   body.NSU,
		Chaves:                body.Chaves,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, req)
}

func (a *ControlPlane) listFiscalDocumentQueries(w http.ResponseWriter, r *http.Request) {
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
	items, err := a.FiscalQueries.List(r.Context(), orgID, limit)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getFiscalDocumentQuery(w http.ResponseWriter, r *http.Request) {
	orgID, queryID, err := parseOrgAndID(r, "query_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	req, err := a.FiscalQueries.Get(r.Context(), orgID, queryID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, req)
}

// --- downloads (act on documents already ingested, sync/direct) ---

func (a *ControlPlane) downloadFiscalDocument(w http.ResponseWriter, r *http.Request) {
	orgID, docID, err := parseOrgAndID(r, "document_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	dl, err := a.Fiscal.DownloadOriginalPayload(r.Context(), orgID, docID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", dl.ContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, dl.Filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(dl.Data)
}

func (a *ControlPlane) downloadFiscalDocumentsZip(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfe_inbound:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		DocumentIDs []uuid.UUID `json:"document_ids"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if len(body.DocumentIDs) == 0 {
		writeErr(w, r, domainerr.Validation("document_ids_required", "document_ids must contain at least one id"))
		return
	}
	if len(body.DocumentIDs) > fiscal.MaxBatchChaves {
		writeErr(w, r, domainerr.Validation("too_many_documents", "a single zip is limited to 100 documents"))
		return
	}

	downloads := make([]*fiscal.DocumentPayloadDownload, 0, len(body.DocumentIDs))
	for _, id := range body.DocumentIDs {
		dl, err := a.Fiscal.DownloadOriginalPayload(r.Context(), orgID, id)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		downloads = append(downloads, dl)
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="notas_fiscais.zip"`)
	w.WriteHeader(http.StatusOK)

	zw := zip.NewWriter(w)
	defer zw.Close()
	for _, dl := range downloads {
		f, err := zw.Create(dl.Filename)
		if err != nil {
			return
		}
		if _, err := f.Write(dl.Data); err != nil {
			return
		}
	}
}
