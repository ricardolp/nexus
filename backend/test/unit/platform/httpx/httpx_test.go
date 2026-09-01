package httpx_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func TestWriteProblem(t *testing.T) {
	t.Parallel()

	rec := httptest.NewRecorder()
	trace := uuid.New()
	httpx.WriteProblem(rec, 422, "document_service_disabled", "Service is not enabled", "detail", trace)

	if rec.Code != 422 {
		t.Fatalf("status=%d", rec.Code)
	}
	var body httpx.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Code != "document_service_disabled" || body.TraceID != trace {
		t.Fatalf("%#v", body)
	}
}

func TestDecodeJSONDisallowsUnknown(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"a":1,"b":2}`))
	var dst struct {
		A int `json:"a"`
	}
	if err := httpx.DecodeJSON(req, &dst); err == nil {
		t.Fatal("expected unknown field error")
	}
}

func TestRequestContextSetsTraceHeaders(t *testing.T) {
	t.Parallel()

	handler := httpx.RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if httpx.TraceIDFrom(r.Context()) == uuid.Nil {
			t.Fatal("missing trace id")
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Header().Get("X-Trace-Id") == "" || rec.Header().Get("X-Correlation-Id") == "" {
		t.Fatal("missing response headers")
	}
}
