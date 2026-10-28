package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/faq"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *InboundAPI) fiscalHelpLookup(w http.ResponseWriter, r *http.Request) {
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	p, ok := auth.PrincipalFrom(r.Context())
	if !ok || p == nil {
		writeErr(w, r, domainerr.Unauthorized("Missing client principal"))
		return
	}
	q := r.URL.Query()
	source := strings.TrimSpace(q.Get("source"))
	code := strings.TrimSpace(q.Get("code"))
	if source == "" || code == "" {
		writeErr(w, r, domainerr.Validation("invalid_query", "source and code are required"))
		return
	}
	result, err := a.FAQ.Lookup(r.Context(), faq.LookupInput{
		OrganizationID: p.OrganizationID,
		Source:         source,
		Code:           code,
		Docsta:         q.Get("docsta"),
		Message:        q.Get("message"),
		Docnum:         q.Get("docnum"),
		Model:          q.Get("model"),
		Lang:           q.Get("lang"),
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (a *ControlPlane) listFAQMessages(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	q := r.URL.Query()
	in := faq.ListMessagesInput{
		Source: q.Get("source"),
		Code:   q.Get("code"),
		Q:      q.Get("q"),
		Limit:  parseLimit(r, 100),
	}
	if activeRaw := strings.TrimSpace(q.Get("active")); activeRaw != "" {
		active, err := strconv.ParseBool(activeRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_active", "active must be true or false"))
			return
		}
		in.Active = &active
	}
	items, err := a.FAQ.ListMessages(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getFAQMessage(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_id", "Invalid message id"))
		return
	}
	msg, err := a.FAQ.GetMessage(r.Context(), id)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, msg)
}

type faqMessageBody struct {
	Source            string   `json:"source"`
	Code              string   `json:"code"`
	Docsta            string   `json:"docsta"`
	Lang              string   `json:"lang"`
	Severity          string   `json:"severity"`
	Title             string   `json:"title"`
	Summary           string   `json:"summary"`
	Steps             []string `json:"steps"`
	ForbiddenActions  []string `json:"forbidden_actions"`
	RecommendedAction string   `json:"recommended_action"`
	FAQSlug           *string  `json:"faq_slug"`
	Active            *bool    `json:"active"`
}

func (a *ControlPlane) createFAQMessage(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	var body faqMessageBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Invalid JSON body"))
		return
	}
	msg, err := a.FAQ.CreateMessage(r.Context(), faq.CreateMessageInput{
		Source:            body.Source,
		Code:              body.Code,
		Docsta:            body.Docsta,
		Lang:              body.Lang,
		Severity:          body.Severity,
		Title:             body.Title,
		Summary:           body.Summary,
		Steps:             body.Steps,
		ForbiddenActions:  body.ForbiddenActions,
		RecommendedAction: body.RecommendedAction,
		FAQSlug:           body.FAQSlug,
		Active:            body.Active,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, msg)
}

func (a *ControlPlane) updateFAQMessage(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_id", "Invalid message id"))
		return
	}
	var body faqMessageBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Invalid JSON body"))
		return
	}
	msg, err := a.FAQ.UpdateMessage(r.Context(), id, faq.UpdateMessageInput{
		Source:            body.Source,
		Code:              body.Code,
		Docsta:            body.Docsta,
		Lang:              body.Lang,
		Severity:          body.Severity,
		Title:             body.Title,
		Summary:           body.Summary,
		Steps:             body.Steps,
		ForbiddenActions:  body.ForbiddenActions,
		RecommendedAction: body.RecommendedAction,
		FAQSlug:           body.FAQSlug,
		Active:            body.Active,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, msg)
}

func (a *ControlPlane) patchFAQMessageActive(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_id", "Invalid message id"))
		return
	}
	var body struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_body", "Invalid JSON body"))
		return
	}
	msg, err := a.FAQ.SetMessageActive(r.Context(), id, body.Active)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, msg)
}

func (a *ControlPlane) listFAQMissingHits(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	in := faq.ListHitsInput{Limit: parseLimit(r, 50)}
	if orgRaw := r.URL.Query().Get("organization_id"); orgRaw != "" {
		id, err := uuid.Parse(orgRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id must be a valid UUID"))
			return
		}
		in.OrganizationID = &id
	}
	items, err := a.FAQ.ListMissingHits(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) listFAQTopHits(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	if a.FAQ == nil {
		writeErr(w, r, domainerr.New(503, "faq_unavailable", "Service Unavailable", "FAQ service is not configured"))
		return
	}
	in := faq.ListHitsInput{Limit: parseLimit(r, 50)}
	if orgRaw := r.URL.Query().Get("organization_id"); orgRaw != "" {
		id, err := uuid.Parse(orgRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id must be a valid UUID"))
			return
		}
		in.OrganizationID = &id
	}
	items, err := a.FAQ.ListTopHits(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}
