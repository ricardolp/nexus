package httpapi_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/transport/httpapi"
)

func TestSigningMaterialUnconfiguredWithoutServiceToken(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{}
	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/companies/"+uuid.NewString()+"/certificates/signing-material",
		strings.NewReader(`{"organization_id":"`+uuid.NewString()+`"}`),
	)
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusServiceUnavailable)
	}
}

func TestSigningMaterialRejectsMissingToken(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{ServiceToken: "s3cr3t"}
	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/companies/"+uuid.NewString()+"/certificates/signing-material",
		strings.NewReader(`{"organization_id":"`+uuid.NewString()+`"}`),
	)
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSigningMaterialRejectsWrongToken(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{ServiceToken: "s3cr3t"}
	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/companies/"+uuid.NewString()+"/certificates/signing-material",
		strings.NewReader(`{"organization_id":"`+uuid.NewString()+`"}`),
	)
	req.Header.Set("Authorization", "Bearer wrong-token")
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnauthorized)
	}
}

func TestSigningMaterialRejectsInvalidCompanyID(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{ServiceToken: "s3cr3t"}
	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/companies/not-a-uuid/certificates/signing-material",
		strings.NewReader(`{"organization_id":"`+uuid.NewString()+`"}`),
	)
	req.Header.Set("Authorization", "Bearer s3cr3t")
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
}

func TestSigningMaterialRejectsMissingOrganizationID(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{ServiceToken: "s3cr3t"}
	req := httptest.NewRequest(
		http.MethodPost,
		"/internal/v1/companies/"+uuid.NewString()+"/certificates/signing-material",
		strings.NewReader(`{}`),
	)
	req.Header.Set("Authorization", "Bearer s3cr3t")
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusUnprocessableEntity)
	}
}

func TestInternalAPIHealthNeedsNoToken(t *testing.T) {
	t.Parallel()

	api := &httpapi.InternalAPI{ServiceToken: "s3cr3t"}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	api.Routes().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}
}
