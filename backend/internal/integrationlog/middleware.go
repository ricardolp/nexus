package integrationlog

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// maxCapturedBodyBytes must stay above every LimitBody applied before this
// middleware (e.g. the SAP DANFE upload), otherwise large bodies get truncated.
const maxCapturedBodyBytes = 32 << 20

// Middleware logs inbound HTTP exchanges (Tokens / inbound_api).
// Skip /health. Capture is best-effort and never alters the response.
func Middleware(rec *Recorder) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rec == nil || r.URL.Path == "/health" || strings.HasPrefix(r.URL.Path, "/metrics") {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now().UTC()
			var reqBody []byte
			if r.Body != nil {
				limited := io.LimitReader(r.Body, maxCapturedBodyBytes)
				buf, err := io.ReadAll(limited)
				_ = r.Body.Close()
				if err == nil {
					reqBody = buf
					r.Body = io.NopCloser(bytes.NewReader(buf))
				} else {
					r.Body = io.NopCloser(bytes.NewReader(nil))
				}
			}

			ctx, resolvedPrincipal := auth.WithPrincipalSlot(r.Context())
			r = r.WithContext(ctx)
			rw := &captureWriter{ResponseWriter: w, status: http.StatusOK, limit: DefaultBodyPreviewLimit}
			next.ServeHTTP(rw, r)

			finished := time.Now().UTC()
			duration := int(finished.Sub(start).Milliseconds())
			status := rw.status

			origin := "api_client"
			actorType := "api_client"
			actorID := ""
			var orgID *uuid.UUID
			if p, ok := resolvedPrincipal(); ok {
				if p.OrganizationID != uuid.Nil {
					id := p.OrganizationID
					orgID = &id
				}
				if p.ClientID != "" {
					actorID = p.ClientID
				}
				if r.Header.Get("X-Org-Token") != "" && p.ClientID == "" {
					origin = "legacy_org_token"
					actorType = "legacy_org_token"
				}
				if p.SourceSystem != "" && actorID == "" {
					actorID = p.SourceSystem
				}
			} else if r.Header.Get("X-Org-Token") != "" {
				origin = "legacy_org_token"
				actorType = "legacy_org_token"
			}

			path := r.URL.Path
			if r.URL.RawQuery != "" {
				path = SanitizeURL(r.URL.String())
				if u := r.URL; u != nil {
					path = u.Path
					if u.RawQuery != "" {
						path = path + "?" + sanitizeRawQuery(u.RawQuery)
					}
				}
			}

			summary := r.Method + " " + r.URL.Path
			level := LevelFromStatus(status)
			reqPreviewSrc := reqBody
			respPreviewSrc := rw.body.Bytes()
			if r.URL.Path == "/v1/oauth/token" {
				reqPreviewSrc = RedactJSONFields(reqBody, "client_secret")
				respPreviewSrc = RedactJSONFields(respPreviewSrc, "access_token")
			}
			entry := Entry{
				OrganizationID:      orgID,
				CorrelationID:       httpx.CorrelationIDFrom(r.Context()),
				TraceID:             httpx.TraceIDFrom(r.Context()),
				SpanName:            "inbound.api",
				ActorType:           actorType,
				ActorID:             actorID,
				Direction:           DirectionInbound,
				Origin:              origin,
				Destination:         "inbound_api",
				Level:               level,
				Summary:             summary,
				HTTPMethod:          r.Method,
				HTTPPath:            path,
				HTTPStatus:          &status,
				DurationMs:          &duration,
				RequestHash:         HashBody(reqBody),
				RequestHeaders:      HeadersJSON(r.Header),
				ResponseHeaders:     HeadersJSON(rw.Header()),
				RequestBodyPreview:  TruncateBody(reqPreviewSrc, DefaultBodyPreviewLimit),
				ResponseBodyPreview: TruncateBody(respPreviewSrc, DefaultBodyPreviewLimit),
				StartedAt:           start,
				FinishedAt:          &finished,
			}
			// Fire-and-forget; don't block the response path longer than needed.
			go rec.Record(context.WithoutCancel(r.Context()), entry)
		})
	}
}

func sanitizeRawQuery(raw string) string {
	return strings.TrimPrefix(SanitizeURL("http://x/?"+raw), "http://x/?")
}

type captureWriter struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
	limit  int
	wrote  bool
}

func (w *captureWriter) WriteHeader(status int) {
	if !w.wrote {
		w.status = status
		w.wrote = true
	}
	w.ResponseWriter.WriteHeader(status)
}

func (w *captureWriter) Write(p []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	if w.body.Len() < w.limit {
		remain := w.limit - w.body.Len()
		if remain > 0 {
			if len(p) > remain {
				_, _ = w.body.Write(p[:remain])
			} else {
				_, _ = w.body.Write(p)
			}
		}
	}
	return w.ResponseWriter.Write(p)
}
