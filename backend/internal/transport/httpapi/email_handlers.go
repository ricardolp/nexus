package httpapi

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/email"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) getEmailCredentials(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	creds, err := a.Email.GetCredentials(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, creds)
}

func (a *ControlPlane) putEmailCredentials(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Host        string  `json:"host"`
		Port        int     `json:"port"`
		Username    string  `json:"username"`
		Password    *string `json:"password"`
		FromName    string  `json:"from_name"`
		FromAddress string  `json:"from_address"`
		Status      string  `json:"status"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	creds, err := a.Email.UpsertCredentials(r.Context(), email.UpdateCredentialsInput{
		OrganizationID: orgID,
		Host:           body.Host,
		Port:           body.Port,
		Username:       body.Username,
		Password:       body.Password,
		FromName:       body.FromName,
		FromAddress:    body.FromAddress,
		Status:         body.Status,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, creds)
}

func (a *ControlPlane) testEmailCredentials(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		To string `json:"to"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Email.TestCredentials(r.Context(), orgID, body.To); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *ControlPlane) listCompanyEmailTemplates(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := parseOrgCompany(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Email.ListTemplates(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) patchCompanyEmailTemplate(w http.ResponseWriter, r *http.Request) {
	orgID, companyID, err := parseOrgCompany(r)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	processCode := chi.URLParam(r, "process_code")
	if processCode == "" {
		writeErr(w, r, domainerr.Validation("invalid_process", "process_code is required"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:manage"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		Enabled           *bool    `json:"enabled"`
		Subject           *string  `json:"subject"`
		ToAddresses       []string `json:"to_addresses"`
		CcAddresses       []string `json:"cc_addresses"`
		BodyHTML          *string  `json:"body_html"`
		FromName          *string  `json:"from_name"`
		FromAddress       *string  `json:"from_address"`
		ClearFromOverride *bool    `json:"clear_from_override"`
		AttachXML         *bool    `json:"attach_xml"`
		AttachDanfeSEFAZ  *bool    `json:"attach_danfe_sefaz"`
		AttachDanfeCustom *bool    `json:"attach_danfe_custom"`
		UsePartnerEmail   *bool    `json:"use_partner_email"`
		UseRecipientEmail *bool    `json:"use_recipient_email"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	clearFrom := body.ClearFromOverride != nil && *body.ClearFromOverride
	tpl, err := a.Email.UpdateTemplate(r.Context(), email.UpdateTemplateInput{
		OrganizationID:    orgID,
		CompanyID:         companyID,
		ProcessCode:       processCode,
		Enabled:           body.Enabled,
		Subject:           body.Subject,
		ToAddresses:       body.ToAddresses,
		CcAddresses:       body.CcAddresses,
		BodyHTML:          body.BodyHTML,
		FromName:          body.FromName,
		FromAddress:       body.FromAddress,
		AttachXML:         body.AttachXML,
		AttachDanfeSEFAZ:  body.AttachDanfeSEFAZ,
		AttachDanfeCustom: body.AttachDanfeCustom,
		UsePartnerEmail:   body.UsePartnerEmail,
		UseRecipientEmail: body.UseRecipientEmail,
		ClearFromOverride: clearFrom,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, tpl)
}

func (a *ControlPlane) listEmailMessages(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	q := r.URL.Query()
	var companyID *uuid.UUID
	if raw := q.Get("company_id"); raw != "" {
		id, err := uuid.Parse(raw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid company_id"))
			return
		}
		companyID = &id
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	items, err := a.Email.ListMessages(r.Context(), email.ListMessagesInput{
		OrganizationID: orgID,
		CompanyID:      companyID,
		ProcessCode:    q.Get("process_code"),
		Status:         q.Get("status"),
		Query:          q.Get("q"),
		Limit:          limit,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getEmailMessage(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "message_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_message_id", "Invalid message_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	msg, err := a.Email.GetMessage(r.Context(), orgID, messageID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, msg)
}

func (a *ControlPlane) downloadEmailAttachment(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	messageID, err := uuid.Parse(chi.URLParam(r, "message_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_message_id", "Invalid message_id"))
		return
	}
	attachmentID, err := uuid.Parse(chi.URLParam(r, "attachment_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_attachment_id", "Invalid attachment_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "email:read"); err != nil {
		writeErr(w, r, err)
		return
	}
	data, filename, contentType, err := a.Email.DownloadAttachment(r.Context(), orgID, messageID, attachmentID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+strings.ReplaceAll(filename, "\"", "")+"\"")
	io.Copy(w, bytes.NewReader(data))
}

func parseOrgCompany(r *http.Request) (uuid.UUID, uuid.UUID, error) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_organization_id", "Invalid organization_id")
	}
	companyID, err := uuid.Parse(chi.URLParam(r, "company_id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, domainerr.Validation("invalid_company_id", "Invalid company_id")
	}
	return orgID, companyID, nil
}

func (a *ControlPlane) listEmailTokens(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": email.TokenCatalog})
}
