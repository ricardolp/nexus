package auth_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func TestIssueAndParseUserToken(t *testing.T) {
	t.Parallel()

	svc := auth.NewTokenService("test-secret", "fiscal-messaging", time.Minute, time.Hour)
	userID := uuid.New()
	orgID := uuid.New()

	token, _, err := svc.IssueUserToken(userID, "member", &orgID)
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != auth.TokenKindUser || p.UserID != userID || p.OrganizationID != orgID || p.PlatformRole != "member" {
		t.Fatalf("unexpected principal %#v", p)
	}
}

func TestIssueAndParseClientToken(t *testing.T) {
	t.Parallel()

	svc := auth.NewTokenService("test-secret", "fiscal-messaging", time.Minute, time.Hour)
	orgID := uuid.New()
	token, _, err := svc.IssueClientToken(orgID, "fm_client", "sap_ecc", []string{"fiscal_documents:create", "fiscal_documents:read"})
	if err != nil {
		t.Fatal(err)
	}
	p, err := svc.Parse(token)
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != auth.TokenKindClient || p.ClientID != "fm_client" || p.SourceSystem != "sap_ecc" || !auth.HasScope(p, "fiscal_documents:create") {
		t.Fatalf("unexpected principal %#v", p)
	}
	if auth.HasScope(p, "webhook:manage") {
		t.Fatal("unexpected scope")
	}
}

func TestMiddlewareRequiresBearer(t *testing.T) {
	t.Parallel()

	svc := auth.NewTokenService("test-secret", "fiscal-messaging", time.Minute, time.Hour)
	handler := auth.Middleware(svc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", rec.Code)
	}
}

func TestMiddlewareAcceptsAccessCookie(t *testing.T) {
	t.Parallel()

	svc := auth.NewTokenService("test-secret", "fiscal-messaging", time.Minute, time.Hour)
	userID := uuid.New()
	token, _, err := svc.IssueUserToken(userID, "member", nil)
	if err != nil {
		t.Fatal(err)
	}
	handler := auth.Middleware(svc)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := auth.PrincipalFrom(r.Context())
		if !ok || p.UserID != userID {
			t.Fatalf("principal=%v ok=%v", p, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodGet, "/v1/users/me", nil)
	req.AddCookie(&http.Cookie{Name: httpx.AccessCookieName, Value: token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestRequireClient(t *testing.T) {
	t.Parallel()

	handler := auth.RequireClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	req := httptest.NewRequest(http.MethodPost, "/v1/fiscal_documents", nil)
	req = req.WithContext(auth.WithPrincipal(req.Context(), &auth.Principal{
		Kind: auth.TokenKindUser, UserID: uuid.New(),
	}))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d", rec.Code)
	}
}
