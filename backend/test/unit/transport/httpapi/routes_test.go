package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/transport/httpapi"
)

func testControlPlane() *httpapi.ControlPlane {
	return &httpapi.ControlPlane{
		Identity: &identity.Service{},
		Orgs:     &organization.Service{},
		Tokens:   auth.NewTokenService("test-secret", "test", 0, 0),
	}
}

// testControlPlaneWithLiveTokens mirrors testControlPlane but issues tokens
// with a real TTL, needed for tests that must present a *valid* (unexpired)
// bearer token to reach a handler's role check.
func testControlPlaneWithLiveTokens() *httpapi.ControlPlane {
	return &httpapi.ControlPlane{
		Identity: &identity.Service{},
		Orgs:     &organization.Service{},
		Tokens:   auth.NewTokenService("test-secret", "test", 5*time.Minute, 0),
	}
}

func bearerToken(t *testing.T, cp *httpapi.ControlPlane, platformRole string) string {
	t.Helper()
	token, _, err := cp.Tokens.IssueUserToken(uuid.New(), platformRole, nil)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return token
}

func TestRegisterRouteIsNotAvailable(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/auth/register", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusNotFound)
	}
}

func TestInviteUserRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/users", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListOrganizationsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListOrganizationsRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListOrganizationsUsageRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/usage-stats", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListOrganizationsUsageRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/usage-stats", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAdminListUserSecurityEventsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/users/"+uuid.NewString()+"/security-events", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAdminListUserSecurityEventsRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/users/"+uuid.NewString()+"/security-events", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAdminListUserAuditEventsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/users/"+uuid.NewString()+"/audit-events", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAdminListUserAuditEventsRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/users/"+uuid.NewString()+"/audit-events", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListMemberSecurityEventsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/security-events", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListMemberAuditEventsRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/audit-events", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListUsersRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/users", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListUsersRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/users", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestDeleteUserRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodDelete, "/v1/users/"+uuid.NewString(), nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDeleteUserRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodDelete, "/v1/users/"+uuid.NewString(), nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAdminSetUserPasswordRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/users/"+uuid.NewString()+"/password", strings.NewReader(`{"password":"abcdefghijkl"}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAdminSetUserPasswordRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/users/"+uuid.NewString()+"/password", strings.NewReader(`{"password":"abcdefghijkl"}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAdminSetMemberPasswordRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/password",
		strings.NewReader(`{"password":"abcdefghijkl"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdateOrganizationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPatch, "/v1/organizations/"+uuid.NewString(), strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdateOrganizationRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPatch, "/v1/organizations/"+uuid.NewString(), strings.NewReader(`{"legal_name":"Acme"}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAddOrganizationMemberRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAddOrganizationMemberRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members", strings.NewReader(`{"email":"a@b.com"}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestDeleteOrganizationMemberRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodDelete, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString(), nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDeleteOrganizationMemberRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodDelete, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString(), nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestResendMemberInvitationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/resend-invite", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestResendMemberInvitationRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/resend-invite", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestUploadCertificateRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/certificates",
		strings.NewReader(`{}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListCertificatesRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/certificates",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRevokeCertificateRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/certificates/"+uuid.NewString()+"/revoke",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListRolesRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/roles", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCreateRoleRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/roles", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCreateRoleRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/roles", strings.NewReader(`{"name":"Analista Fiscal","permissions":["nfe:read"]}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestAssignMemberRoleRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/roles", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAssignMemberRoleRejectsMemberFromDifferentOrg(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/organizations/"+uuid.NewString()+"/members/"+uuid.NewString()+"/roles", strings.NewReader(`{"role_id":"`+uuid.NewString()+`"}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestLoginRejectsInvalidEmail(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/auth/login",
		strings.NewReader(`{"email":"not-an-email","password":"senha-super-segura"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
}

func testInboundAPI() *httpapi.InboundAPI {
	return &httpapi.InboundAPI{
		Tokens: auth.NewTokenService("test-secret", "test", 5*time.Minute, 5*time.Minute),
	}
}

func TestLegacySAPDocumentRouteRequiresOrgToken(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/nfe/documents/sap", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testInboundAPI().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestLegacySAPDocumentAliasRequiresOrgToken(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/nfe/documents/sap", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testInboundAPI().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCanonicalFiscalDocumentRouteStillRequiresBearer(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/fiscal_documents/nfe", strings.NewReader(`{}`))
	req.Header.Set("X-Org-Token", "does-not-unlock-canonical-route")
	rec := httptest.NewRecorder()
	testInboundAPI().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSetLegacyOrgTokenRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/api_clients/"+uuid.NewString()+"/legacy_org_token",
		strings.NewReader(`{"org_token":"existing-sap-org-token"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRotateInboundTokenRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/api_clients/"+uuid.NewString()+"/inbound_token",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRevokeAPIClientRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/api_clients/"+uuid.NewString()+"/revoke",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListSupportTicketsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/support/tickets", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCreateSupportTicketRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/support/tickets",
		strings.NewReader(`{"subject":"x","body_html":"<p>hello world</p>"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSupportConfigRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/support/config", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCreateOrganizationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/organizations", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCreateOrganizationRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodPost, "/v1/organizations", strings.NewReader(`{"legal_name":"Acme","slug":"acme"}`))
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListRequestTracesRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/request_traces", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListRequestTracesRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/request_traces", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestGetRequestTraceRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/request_traces/"+uuid.NewString(), nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListPlatformErrorsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/platform/errors", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListPlatformErrorsRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/platform/errors", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestPlatformStatusRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/platform/status", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestPlatformStatusRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/platform/status", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestListCompaniesUsageRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/companies/usage", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListCompaniesUsageRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/companies/usage", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}

func TestGetBillingStatementRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/billing/statement", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDownloadBillingStatementPDFRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/billing/statement.pdf", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestDownloadBillingStatementPDFRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/billing/statement.pdf", nil)
	req.Header.Set("Authorization", "Bearer "+bearerToken(t, cp, identity.PlatformRoleMember))
	rec := httptest.NewRecorder()
	cp.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusForbidden)
	}
}
