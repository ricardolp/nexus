package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func allowlistHandler(cidrs []string) http.Handler {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return httpx.IPAllowlist(cidrs)(next)
}

func TestIPAllowlistAllowsLoopback(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	rec := httptest.NewRecorder()
	allowlistHandler(httpx.DefaultInternalCIDRs).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", rec.Code)
	}
}

func TestIPAllowlistAllowsIPv6Loopback(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "[::1]:54321"
	rec := httptest.NewRecorder()
	allowlistHandler(httpx.DefaultInternalCIDRs).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200", rec.Code)
	}
}

func TestIPAllowlistAllowsPrivateRanges(t *testing.T) {
	t.Parallel()

	for _, addr := range []string{"10.0.5.12:1234", "172.20.0.7:1234", "192.168.1.50:1234", "[fd12:0:0:1::1]:1234"} {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.RemoteAddr = addr
		rec := httptest.NewRecorder()
		allowlistHandler(httpx.DefaultInternalCIDRs).ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("addr=%s status=%d, want 200", addr, rec.Code)
		}
	}
}

func TestIPAllowlistRejectsPublicAddress(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "8.8.8.8:54321"
	rec := httptest.NewRecorder()
	allowlistHandler(httpx.DefaultInternalCIDRs).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want 403", rec.Code)
	}
}

func TestIPAllowlistRejectsUnparsableRemoteAddr(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "not-an-address"
	rec := httptest.NewRecorder()
	allowlistHandler(httpx.DefaultInternalCIDRs).ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want 403", rec.Code)
	}
}

func TestIPAllowlistCustomCIDRsNarrowAccess(t *testing.T) {
	t.Parallel()

	handler := allowlistHandler([]string{"192.168.5.0/24"})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "192.168.5.10:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("in-range status=%d, want 200", rec.Code)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req2.RemoteAddr = "192.168.6.10:1234"
	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req2)
	if rec2.Code != http.StatusForbidden {
		t.Fatalf("out-of-range status=%d, want 403", rec2.Code)
	}
}

func TestIPAllowlistIgnoresInvalidCIDREntriesRatherThanCrashing(t *testing.T) {
	t.Parallel()

	handler := allowlistHandler([]string{"not-a-cidr", "127.0.0.0/8"})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200 (valid entry should still apply)", rec.Code)
	}
}
