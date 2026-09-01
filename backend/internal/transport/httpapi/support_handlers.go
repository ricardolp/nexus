package httpapi

import (
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
	"github.com/nexus/fiscal-messaging/internal/support"
)

func (a *ControlPlane) supportConfig(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, a.Support.Config())
}

func (a *ControlPlane) createSupportTicket(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Subject       string                      `json:"subject"`
		BodyHTML      string                      `json:"body_html"`
		Priority      string                      `json:"priority"`
		DocumentLinks []support.DocumentLinkInput `json:"document_links"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	ticket, err := a.Support.Create(r.Context(), support.CreateInput{
		OrganizationID: orgID,
		OpenedByUserID: p.UserID,
		Subject:        body.Subject,
		BodyHTML:       body.BodyHTML,
		Priority:       body.Priority,
		DocumentLinks:  body.DocumentLinks,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, ticket)
}

func (a *ControlPlane) listSupportTickets(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	limit, err := parseLimitParam(r.URL.Query().Get("limit"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	page, err := parsePageParam(r.URL.Query().Get("page"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in := support.ListInput{
		OrganizationID: orgID,
		Status:         r.URL.Query().Get("status"),
		Page:           page,
		Limit:          limit,
	}
	if !isPlatformStaff(p) {
		in.OpenedByUserID = &p.UserID
	}
	result, err := a.Support.List(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (a *ControlPlane) getSupportTicket(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, ticketID, err := parseOrgAndID(r, "ticket_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var openedBy *uuid.UUID
	if !isPlatformStaff(p) {
		openedBy = &p.UserID
	}
	ticket, err := a.Support.Get(r.Context(), orgID, ticketID, openedBy)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ticket)
}

func (a *ControlPlane) addSupportTicketMessage(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, ticketID, err := parseOrgAndID(r, "ticket_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var openedBy *uuid.UUID
	if !isPlatformStaff(p) {
		openedBy = &p.UserID
	}
	if _, err := a.Support.Get(r.Context(), orgID, ticketID, openedBy); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		BodyHTML string `json:"body_html"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	ticket, err := a.Support.AddMessage(r.Context(), support.AddMessageInput{
		OrganizationID: orgID,
		TicketID:       ticketID,
		AuthorUserID:   p.UserID,
		BodyHTML:       body.BodyHTML,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, ticket)
}

func (a *ControlPlane) uploadSupportAttachment(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, ticketID, err := parseOrgAndID(r, "ticket_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var openedBy *uuid.UUID
	if !isPlatformStaff(p) {
		openedBy = &p.UserID
	}
	if _, err := a.Support.Get(r.Context(), orgID, ticketID, openedBy); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_multipart", "Invalid multipart body"))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, r, domainerr.Validation("file_required", "file is required"))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, support.MaxAttachmentB+1))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var messageID *uuid.UUID
	if raw := r.FormValue("message_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_message_id", "message_id must be a valid UUID"))
			return
		}
		messageID = &id
	}
	att, err := a.Support.AddAttachment(r.Context(), support.AddAttachmentInput{
		OrganizationID: orgID,
		TicketID:       ticketID,
		MessageID:      messageID,
		CreatedBy:      p.UserID,
		Filename:       header.Filename,
		ContentType:    header.Header.Get("Content-Type"),
		Data:           data,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, att)
}

func (a *ControlPlane) downloadSupportAttachment(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, ticketID, err := parseOrgAndID(r, "ticket_id")
	if err != nil {
		writeErr(w, r, err)
		return
	}
	attachmentID, err := uuid.Parse(chi.URLParam(r, "attachment_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_attachment_id", "Invalid attachment_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	var openedBy *uuid.UUID
	if !isPlatformStaff(p) {
		openedBy = &p.UserID
	}
	data, att, err := a.Support.GetAttachment(r.Context(), orgID, ticketID, attachmentID, openedBy)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", att.ContentType)
	w.Header().Set("Content-Disposition", `attachment; filename="`+att.OriginalFilename+`"`)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func parsePageParam(raw string) (int, error) {
	if raw == "" {
		return 0, nil
	}
	page, err := strconv.Atoi(raw)
	if err != nil || page < 0 {
		return 0, domainerr.Validation("invalid_page", "page must be a non-negative integer")
	}
	return page, nil
}

func isPlatformStaff(p *auth.Principal) bool {
	if p == nil {
		return false
	}
	return p.PlatformRole == identity.PlatformRoleAdmin ||
		p.PlatformRole == identity.PlatformRoleSystem ||
		p.PlatformRole == identity.PlatformRoleSupport
}
