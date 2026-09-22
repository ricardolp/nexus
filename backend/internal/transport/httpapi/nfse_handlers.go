package httpapi

import (
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/fiscal"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) suggestNextRPS(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	next, err := a.Orgs.SuggestNextRPS(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, next)
}

func (a *ControlPlane) lastNFSeClassification(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	cnae := strings.TrimSpace(r.URL.Query().Get("cnae"))
	item, err := a.Orgs.LastNFSeClassification(r.Context(), orgID, companyID, cnae)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if item == nil {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"found": false})
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"found":              true,
		"cnae_code":          item.CNAECode,
		"item_lista_servico": item.ServiceListItem,
		"codigo_nbs":         item.NBSCode,
		"nbs_description":    item.NBSDescription,
	})
}

func (a *ControlPlane) suggestNFSeClassification(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := a.companyFromURL(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:create"); err != nil {
		writeErr(w, r, err)
		return
	}

	var body struct {
		CNAECode            string `json:"cnae_code"`
		DraftDiscrimination string `json:"draft_discrimination"`
		CurrentNBS          string `json:"current_nbs"`
		CurrentLC116        string `json:"current_lc116"`
		CustomerID          string `json:"customer_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Invalid JSON body"))
		return
	}

	in := organization.SuggestNFSeClassificationInput{
		OrganizationID:      orgID,
		CompanyID:           companyID,
		CNAECode:            body.CNAECode,
		DraftDiscrimination: body.DraftDiscrimination,
		CurrentNBS:          body.CurrentNBS,
		CurrentLC116:        body.CurrentLC116,
	}
	if cid := strings.TrimSpace(body.CustomerID); cid != "" {
		parsed, perr := uuid.Parse(cid)
		if perr != nil {
			writeErr(w, r, domainerr.Validation("invalid_customer_id", "Invalid customer_id"))
			return
		}
		in.CustomerID = parsed
	}

	result, err := a.Orgs.SuggestNFSeClassification(r.Context(), a.LLM, in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

// createOutboundNFSe accepts the nested SAP NFS-e JSON from the Nexus UI and
// reuses fiscal.Service.Receive (same path as the OAuth inbound_api).
func (a *ControlPlane) createOutboundNFSe(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	companyID, err := uuid.Parse(chi.URLParam(r, "company_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid company_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "nfse:create"); err != nil {
		writeErr(w, r, err)
		return
	}
	if _, err := a.Orgs.GetCompany(r.Context(), orgID, companyID); err != nil {
		writeErr(w, r, err)
		return
	}

	defer r.Body.Close()
	payload, err := io.ReadAll(r.Body)
	if err != nil || len(payload) == 0 {
		writeErr(w, r, domainerr.Validation("invalid_body", "Request body with NFS-e JSON is required"))
		return
	}

	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" {
		writeErr(w, r, domainerr.Validation("missing_idempotency_key", "Idempotency-Key is required"))
		return
	}

	contentType := strings.TrimSpace(r.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "application/json"
	}

	result, err := a.Fiscal.Receive(r.Context(), fiscal.ReceiveInput{
		OrganizationID:        orgID,
		OrganizationCompanyID: companyID,
		DocumentType:          "nfse",
		Direction:             "outbound",
		SourceSystem:          "nexus_ui",
		IdempotencyKey:        idempotencyKey,
		Payload:               payload,
		ContentType:           contentType,
		ActorType:             "user",
		ActorID:               p.UserID.String(),
		CorrelationID:         httpx.CorrelationIDFrom(r.Context()),
		TraceID:               httpx.TraceIDFrom(r.Context()),
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}

	status := http.StatusAccepted
	if result.Replayed {
		status = http.StatusOK
	}
	httpx.WriteJSON(w, status, map[string]any{
		"document_id": result.Document.ID,
		"trace_id":    result.Document.TraceID,
		"status":      result.Document.Status,
		"replayed":    result.Replayed,
	})
}
