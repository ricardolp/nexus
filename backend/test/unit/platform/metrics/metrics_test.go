package metrics_test

import (
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/metrics"
)

func TestStartEmptyAddrIsNoop(t *testing.T) {
	t.Parallel()
	if srv := metrics.Start("", nil); srv != nil {
		t.Fatal("expected nil server when addr is empty")
	}
}

func TestStartServesMetricsAndHealth(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	srv := metrics.Start(addr, nil)
	if srv == nil {
		t.Fatal("expected metrics server")
	}
	t.Cleanup(func() { metrics.Stop(srv) })

	deadline := time.Now().Add(2 * time.Second)
	var health *http.Response
	for time.Now().Before(deadline) {
		health, err = http.Get("http://" + addr + "/health")
		if err == nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("health: %v", err)
	}
	defer health.Body.Close()
	if health.StatusCode != http.StatusOK {
		t.Fatalf("health status=%d", health.StatusCode)
	}

	resp, err := http.Get("http://" + addr + "/metrics")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("metrics status=%d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if len(body) == 0 {
		t.Fatal("empty metrics body")
	}
}

func TestHTTPRecordsRoutePattern(t *testing.T) {
	t.Parallel()

	r := chi.NewRouter()
	r.Use(metrics.HTTP("control_plane_api"))
	r.Get("/v1/users/{user_id}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/users/11111111-1111-1111-1111-111111111111", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status=%d", rec.Code)
	}
}
