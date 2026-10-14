package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSPreflightAllowsEveryMethodTheAPIRoutes(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://qas.example.com")
	h := CORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("preflight must not reach the handler")
	}))
	req := httptest.NewRequest(http.MethodOptions, "/v1/anything", nil)
	req.Header.Set("Origin", "https://qas.example.com")
	req.Header.Set("Access-Control-Request-Method", http.MethodPut)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
	allowed := rec.Header().Get("Access-Control-Allow-Methods")
	for _, m := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		if !strings.Contains(allowed, m) {
			t.Fatalf("Access-Control-Allow-Methods %q is missing %s", allowed, m)
		}
	}
}
