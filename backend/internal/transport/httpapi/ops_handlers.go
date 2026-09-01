package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/ops"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func (a *ControlPlane) listRequestTraces(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	in := ops.ListTracesInput{Limit: parseLimit(r, 50)}
	if orgRaw := r.URL.Query().Get("organization_id"); orgRaw != "" {
		id, err := uuid.Parse(orgRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id must be a valid UUID"))
			return
		}
		in.OrganizationID = &id
	}
	if statusRaw := r.URL.Query().Get("http_status"); statusRaw != "" {
		status, err := strconv.Atoi(statusRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_http_status", "http_status must be an integer"))
			return
		}
		in.HTTPStatus = &status
	}
	in.SpanName = r.URL.Query().Get("span_name")
	if since, err := parseOptionalTime(r.URL.Query().Get("since")); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_since", "since must be an RFC3339 timestamp"))
		return
	} else {
		in.Since = since
	}
	if until, err := parseOptionalTime(r.URL.Query().Get("until")); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_until", "until must be an RFC3339 timestamp"))
		return
	} else {
		in.Until = until
	}
	if before, err := parseOptionalTime(r.URL.Query().Get("before")); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_before", "before must be an RFC3339 timestamp"))
		return
	} else {
		in.Before = before
	}

	items, nextBefore, err := a.Ops.ListRequestTraces(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"next_before": nextBefore,
	})
}

func (a *ControlPlane) getRequestTrace(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "trace_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_trace_id", "Invalid trace_id"))
		return
	}
	trace, err := a.Ops.GetRequestTrace(r.Context(), id)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, trace)
}

func (a *ControlPlane) listPlatformErrors(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	in := ops.ListErrorsInput{
		Limit:  parseLimit(r, 50),
		Source: r.URL.Query().Get("source"),
	}
	if orgRaw := r.URL.Query().Get("organization_id"); orgRaw != "" {
		id, err := uuid.Parse(orgRaw)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id must be a valid UUID"))
			return
		}
		in.OrganizationID = &id
	}
	if before, err := parseOptionalTime(r.URL.Query().Get("before")); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_before", "before must be an RFC3339 timestamp"))
		return
	} else {
		in.Before = before
	}

	items, nextBefore, err := a.Ops.ListPlatformErrors(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"next_before": nextBefore,
	})
}

func (a *ControlPlane) getPlatformStatus(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	status, err := a.Ops.PlatformStatus(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, status)
}

func (a *ControlPlane) listCompaniesUsage(w http.ResponseWriter, r *http.Request) {
	if _, err := requirePlatformStaff(r); err != nil {
		writeErr(w, r, err)
		return
	}
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.Orgs.EnsureActiveOrganization(r.Context(), orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	items, err := a.Ops.ListCompaniesUsage(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func parseLimit(r *http.Request, fallback int) int {
	raw := r.URL.Query().Get("limit")
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func parseOptionalTime(raw string) (*time.Time, error) {
	if raw == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
