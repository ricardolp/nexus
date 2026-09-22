package httpapi

import (
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// InternalAPI is the service-to-service surface — certificate signing-material
// and integration log capture for the nfe-gateway. Never exposed on the
// public inbound_api or the tenant-facing control_plane_api.
//
// See docs/architecture/22_nfe_gateway_service.md.
type InternalAPI struct {
	Certificates    *certificate.Service
	IntegrationLogs *integrationlog.Recorder
	ServiceToken    string
}

func (a *InternalAPI) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Group(func(r chi.Router) {
		r.Use(a.requireServiceToken)
		r.Post("/internal/v1/companies/{company_id}/certificates/signing-material", a.signingMaterial)
		r.Post("/internal/v1/integration_logs", a.createIntegrationLog)
	})
	return r
}

func (a *InternalAPI) requireServiceToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.ServiceToken == "" {
			writeErr(w, r, domainerr.New(503, "internal_api_unconfigured", "Service Unavailable", "NFE_GATEWAY_SERVICE_TOKEN is not set"))
			return
		}
		const prefix = "Bearer "
		auth := r.Header.Get("Authorization")
		if len(auth) <= len(prefix) || auth[:len(prefix)] != prefix {
			writeErr(w, r, domainerr.Unauthorized("Missing bearer token"))
			return
		}
		token := auth[len(prefix):]
		if subtle.ConstantTimeCompare([]byte(token), []byte(a.ServiceToken)) != 1 {
			writeErr(w, r, domainerr.Unauthorized("Invalid service token"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *InternalAPI) signingMaterial(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(chi.URLParam(r, "company_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid company_id"))
		return
	}
	var body struct {
		OrganizationID string `json:"organization_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	orgID, err := uuid.Parse(body.OrganizationID)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id is required"))
		return
	}

	pfx, cert, err := a.Certificates.ExportSigningMaterial(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	defer func() {
		for i := range pfx {
			pfx[i] = 0
		}
	}()

	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"pfx_base64": base64.StdEncoding.EncodeToString(pfx),
		"thumbprint": cert.Thumbprint,
		"not_after":  cert.NotAfter,
	})
}

type internalIntegrationLogBody struct {
	OrganizationID      string          `json:"organization_id"`
	Direction           string          `json:"direction"`
	Origin              string          `json:"origin"`
	Destination         string          `json:"destination"`
	SpanName            string          `json:"span_name"`
	Summary             string          `json:"summary"`
	Level               string          `json:"level"`
	HTTPMethod          string          `json:"http_method"`
	HTTPPath            string          `json:"http_path"`
	HTTPStatus          *int            `json:"http_status"`
	DurationMs          *int            `json:"duration_ms"`
	RequestHeaders      json.RawMessage `json:"request_headers_json"`
	ResponseHeaders     json.RawMessage `json:"response_headers_json"`
	RequestBodyPreview  string          `json:"request_body_preview"`
	ResponseBodyPreview string          `json:"response_body_preview"`
	RequestPayloadKey   string          `json:"request_payload_key"`
	ResponsePayloadKey  string          `json:"response_payload_key"`
	CorrelationID       string          `json:"correlation_id"`
	TraceID             string          `json:"trace_id"`
	Metadata            json.RawMessage `json:"metadata_json"`
}

func (a *InternalAPI) createIntegrationLog(w http.ResponseWriter, r *http.Request) {
	if a.IntegrationLogs == nil {
		writeErr(w, r, domainerr.New(503, "integration_logs_unconfigured", "Service Unavailable", "integration log recorder is not configured"))
		return
	}
	var body internalIntegrationLogBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	orgID, err := uuid.Parse(strings.TrimSpace(body.OrganizationID))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id is required"))
		return
	}
	now := time.Now().UTC()
	entry := integrationlog.Entry{
		OrganizationID:      &orgID,
		SpanName:            strings.TrimSpace(body.SpanName),
		Direction:           strings.TrimSpace(body.Direction),
		Origin:              strings.TrimSpace(body.Origin),
		Destination:         strings.TrimSpace(body.Destination),
		Level:               strings.TrimSpace(body.Level),
		Summary:             strings.TrimSpace(body.Summary),
		HTTPMethod:          strings.TrimSpace(body.HTTPMethod),
		HTTPPath:            strings.TrimSpace(body.HTTPPath),
		HTTPStatus:          body.HTTPStatus,
		DurationMs:          body.DurationMs,
		RequestHeaders:      body.RequestHeaders,
		ResponseHeaders:     body.ResponseHeaders,
		RequestBodyPreview:  integrationlog.TruncateBody([]byte(body.RequestBodyPreview), integrationlog.DefaultBodyPreviewLimit),
		ResponseBodyPreview: integrationlog.TruncateBody([]byte(body.ResponseBodyPreview), integrationlog.DefaultBodyPreviewLimit),
		RequestPayloadKey:   strings.TrimSpace(body.RequestPayloadKey),
		ResponsePayloadKey:  strings.TrimSpace(body.ResponsePayloadKey),
		Metadata:            body.Metadata,
		StartedAt:           now,
		FinishedAt:          &now,
	}
	if entry.Direction == "" {
		entry.Direction = integrationlog.DirectionOutbound
	}
	if entry.Origin == "" {
		entry.Origin = "nfe_gateway"
	}
	if entry.SpanName == "" {
		entry.SpanName = "outbound.provider"
	}
	if entry.Level == "" {
		if body.HTTPStatus != nil {
			entry.Level = integrationlog.LevelFromStatus(*body.HTTPStatus)
		} else {
			entry.Level = integrationlog.LevelInfo
		}
	}
	if entry.Summary == "" {
		entry.Summary = entry.SpanName
	}
	if cid, err := uuid.Parse(body.CorrelationID); err == nil {
		entry.CorrelationID = cid
	}
	if tid, err := uuid.Parse(body.TraceID); err == nil {
		entry.TraceID = tid
	}
	a.IntegrationLogs.Record(r.Context(), entry)
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"status": "accepted"})
}
