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

func TestCreateOutboundNFSeRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/fiscal_documents/nfse",
		strings.NewReader(`{}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestResubmitOutboundDocumentRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/resubmit",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestAbortOutboundProcessingRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/abort_processing",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCancelOutboundNFSeRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/cancel",
		strings.NewReader(`{"c_motivo":"1","justificativa":"Erro na emissao da nota"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestCancelOutboundNFeRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/cancel",
		strings.NewReader(`{"justificativa":"Erro na emissao da nota fiscal"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequestOutboundCCeRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/cce",
		strings.NewReader(`{"correcao":"Correcao de dados cadastrais do destinatario"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequestOutboundProtocolRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/"+uuid.NewString()+"/request_protocol",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestRequestInutilizationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/fiscal_documents/inutilization",
		strings.NewReader(`{"organization_company_id":"`+uuid.NewString()+`","serie":"1","numero_inicial":1,"numero_final":1,"ano":2026,"justificativa":"Faixa nao utilizada no periodo"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListCustomersRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/customers", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListMaterialsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/materials", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdateCompanyCNAERequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPatch,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/cnaes/"+uuid.NewString(),
		strings.NewReader(`{"enabled":false}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListOrganizationServicesRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/services",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestUpdateOrganizationServiceStatusRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPatch,
		"/v1/organizations/"+uuid.NewString()+"/services/"+uuid.NewString(),
		strings.NewReader(`{"status":"active"}`),
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListCompanyNFSeServicesRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/nfse_services",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSuggestNextRPSRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/nfse/next_rps",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestLastNFSeClassificationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/nfse/last_classification?cnae=3314711",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSuggestNFSeClassificationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodPost,
		"/v1/organizations/"+uuid.NewString()+"/companies/"+uuid.NewString()+"/nfse/suggest_classification",
		strings.NewReader(`{"cnae_code":"6201501"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSearchCatalogLC116RequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/catalogs/lc116?cnae=3314711",
		nil,
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

func TestInboundOAuthTokenRouteRejectsMissingGrant(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/token", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testInboundAPI().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnprocessableEntity)
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

func TestSAPEventRoutesRequireOrgToken(t *testing.T) {
	t.Parallel()

	chave := "35260912345678000190550010000001231000001234"
	cases := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/v1/nfe/documents/sap/cancel", `{"chave_acesso":"` + chave + `","justificativa":"Erro na emissao da nota"}`},
		{http.MethodPost, "/v1/nfe/documents/sap/cce", `{"chave_acesso":"` + chave + `","correcao":"Correcao do endereco do destinatario","n_seq_evento":1}`},
		{http.MethodPost, "/v1/nfe/documents/sap/inutilization", `{"cnpj_emitente":"12345678000190","serie":"1","numero_inicial":1,"numero_final":1,"ano":2026,"justificativa":"Faixa nao utilizada"}`},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/status", ""},
		{http.MethodPost, "/v1/nfe/documents/sap/" + chave + "/protocol", ""},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/xml", ""},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/events/cce/1/xml", ""},
		{http.MethodPost, "/v1/nfe/documents/sap/" + chave + "/danfe", `{"pdf_base64":"JVBERi0="}`},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/danfe", ""},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/danfe/retrato", ""},
		{http.MethodGet, "/v1/nfe/documents/sap/" + chave + "/danfe/paisagem", ""},
		{http.MethodGet, "/v1/nfse/documents/sap/" + chave + "/danfe", ""},
		{http.MethodGet, "/v1/nfse/documents/sap/" + chave + "/xml", ""},
		{http.MethodGet, "/api/v1/nfse/documents/sap/" + chave + "/danfe", ""},
		{http.MethodGet, "/api/v1/nfse/documents/sap/" + chave + "/xml", ""},
		{http.MethodPost, "/api/v1/nfe/documents/sap/cce", `{}`},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			rec := httptest.NewRecorder()
			testInboundAPI().Routes().ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "Missing x-Org-Token") {
				t.Fatalf("status=%d body=%s, want 401 Missing x-Org-Token", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestSAPDanfeBodyLimitOnlyForDanfeUpload(t *testing.T) {
	t.Parallel()

	chave := "35260912345678000190550010000001231000001234"
	upload := httptest.NewRequest(http.MethodPost, "/v1/nfe/documents/sap/"+chave+"/danfe", nil)
	if httpapi.SAPDanfeBodyLimit(upload) <= 1<<20 {
		t.Fatalf("DANFE upload should get a raised body limit")
	}
	for _, req := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/v1/nfe/documents/sap/"+chave+"/danfe", nil),
		httptest.NewRequest(http.MethodPost, "/v1/nfe/documents/sap", nil),
		httptest.NewRequest(http.MethodPost, "/v1/nfe/documents/sap/cce", nil),
	} {
		if got := httpapi.SAPDanfeBodyLimit(req); got != 0 {
			t.Fatalf("%s %s limit=%d, want default (0)", req.Method, req.URL.Path, got)
		}
	}
}

func TestCanonicalFiscalDocumentRouteAuth(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		headers    map[string]string
		wantDetail string
	}{
		{"no credentials", nil, "Missing access token"},
		{"org token", map[string]string{"X-Org-Token": "legacy-token"}, "Invalid organization token"},
		{"invalid bearer", map[string]string{"Authorization": "Bearer nope"}, "Invalid access token"},
		{"bearer wins over org token", map[string]string{"Authorization": "Bearer nope", "X-Org-Token": "legacy-token"}, "Invalid access token"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodPost, "/v1/fiscal_documents/nfse", strings.NewReader(`{}`))
			for k, v := range tc.headers {
				req.Header.Set(k, v)
			}
			rec := httptest.NewRecorder()
			testInboundAPI().Routes().ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
			}
			if !strings.Contains(rec.Body.String(), tc.wantDetail) {
				t.Fatalf("body=%s, want detail %q", rec.Body.String(), tc.wantDetail)
			}
		})
	}
}

func TestFiscalDocumentReadRouteIgnoresOrgToken(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/fiscal_documents/"+uuid.NewString(), nil)
	req.Header.Set("X-Org-Token", "legacy-token")
	rec := httptest.NewRecorder()
	testInboundAPI().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized || !strings.Contains(rec.Body.String(), "Missing access token") {
		t.Fatalf("status=%d body=%s, want 401 Missing access token", rec.Code, rec.Body.String())
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

func TestListIntegrationLogsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/integration_logs",
		nil,
	)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestGetIntegrationLogRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(
		http.MethodGet,
		"/v1/organizations/"+uuid.NewString()+"/integration_logs/"+uuid.NewString(),
		nil,
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

func TestListMyOrganizationsRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/users/me/organizations", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSwitchOrganizationRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodPost, "/v1/auth/switch-organization", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListSupportMembersRequiresAuthentication(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/v1/organizations/"+uuid.NewString()+"/support-members", nil)
	rec := httptest.NewRecorder()
	testControlPlane().Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestListUserOrganizationsRejectsMemberRole(t *testing.T) {
	t.Parallel()

	cp := testControlPlaneWithLiveTokens()
	req := httptest.NewRequest(http.MethodGet, "/v1/users/"+uuid.NewString()+"/organizations", nil)
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
