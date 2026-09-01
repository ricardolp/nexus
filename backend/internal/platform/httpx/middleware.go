package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type ctxKey string

const (
	TraceIDKey      ctxKey = "trace_id"
	CorrelationKey  ctxKey = "correlation_id"
	RequestStartKey ctxKey = "request_start"
)

const DefaultMaxBodyBytes int64 = 1 << 20

func RequestContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := ids.New()
		correlationID := parseOrNew(r.Header.Get("X-Correlation-Id"))

		ctx := context.WithValue(r.Context(), TraceIDKey, traceID)
		ctx = context.WithValue(ctx, CorrelationKey, correlationID)
		ctx = context.WithValue(ctx, RequestStartKey, time.Now().UTC())

		w.Header().Set("X-Trace-Id", traceID.String())
		w.Header().Set("X-Correlation-Id", correlationID.String())

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func LimitBody(maxBytes int64) func(http.Handler) http.Handler {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBodyBytes
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

func AccessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rw, r)
			logger.Info("http_request",
				"method", r.Method,
				"path", r.URL.Path,
				"status", rw.status,
				"duration_ms", time.Since(start).Milliseconds(),
				"trace_id", TraceIDFrom(r.Context()).String(),
			)
		})
	}
}

func TraceIDFrom(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(TraceIDKey).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

func CorrelationIDFrom(ctx context.Context) uuid.UUID {
	if v, ok := ctx.Value(CorrelationKey).(uuid.UUID); ok {
		return v
	}
	return uuid.Nil
}

func parseOrNew(raw string) uuid.UUID {
	if raw == "" {
		return ids.New()
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return ids.New()
	}
	return id
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
