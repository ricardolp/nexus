package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	var de *domainerr.Error
	if errors.As(err, &de) {
		if de.Status == http.StatusUnprocessableEntity || de.Status == http.StatusConflict {
			slog.Warn("request_rejected: "+de.Code,
				"trace_id", httpx.TraceIDFrom(r.Context()), "path", r.URL.Path, "method", r.Method,
				"status", de.Status, "code", de.Code, "detail", de.Detail)
		}
		httpx.WriteProblem(w, de.Status, de.Code, de.Title, de.Detail, httpx.TraceIDFrom(r.Context()))
		return
	}
	traceID := httpx.TraceIDFrom(r.Context())
	slog.Error("unhandled_error", "trace_id", traceID, "path", r.URL.Path, "method", r.Method, "err", err)
	httpx.WriteProblem(w, http.StatusInternalServerError, "internal_error", "Internal Server Error", "Unexpected error", traceID)
}
