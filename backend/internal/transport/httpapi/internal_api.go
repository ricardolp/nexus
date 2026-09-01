package httpapi

import (
	"crypto/subtle"
	"encoding/base64"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

// InternalAPI is the service-to-service surface — today just the
// certificate signing-material endpoint the nfe-gateway calls, never
// exposed on the public inbound_api or the tenant-facing control_plane_api.
// It is meant to run on its own listener (cmd/internal_api) bound to a
// private network in deployment; ServiceToken is the only line of defense
// in the meantime, so it must be treated as sensitive as a database
// credential, not as a tenant-facing API key.
//
// See docs/architecture/22_nfe_gateway_service.md, "Certificado digital:
// Key Vault ou local".
//
// SECURITY: this process must terminate/be reached over TLS in any
// deployment beyond localhost — the response body is PFX private key
// material, and the request carries a bearer token, both in the clear over
// plain HTTP otherwise. Nothing in this package enforces that (net/http
// doesn't care which scheme fronts it); it has to come from the deployment
// (a TLS-terminating proxy, mTLS between backend and nfe-gateway, or both).
type InternalAPI struct {
	Certificates *certificate.Service
	ServiceToken string
}

func (a *InternalAPI) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Group(func(r chi.Router) {
		r.Use(a.requireServiceToken)
		r.Post("/internal/v1/companies/{company_id}/certificates/signing-material", a.signingMaterial)
	})
	return r
}

// requireServiceToken is deliberately simple (constant-time bearer token
// compare, nothing per-caller) — this endpoint's real protection is meant
// to be network isolation, not a rich auth scheme; see the Routes doc
// comment. Upgrading to mTLS between backend and nfe-gateway is the
// documented hardening path if this ever needs to cross an untrusted
// network.
func (a *InternalAPI) requireServiceToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if a.ServiceToken == "" {
			writeErr(w, r, domainerr.New(503, "internal_api_unconfigured", "Service Unavailable", "NFE_GATEWAY_SERVICE_TOKEN is not set"))
			return
		}
		const prefix = "Bearer "
		auth := r.Header.Get("Authorization")
		if len(auth) <= len(prefix) || auth[:len(prefix)] != prefix {
			writeErr(w, r, domainerr.Unauthorized("Missing bearer token"))
			return
		}
		token := auth[len(prefix):]
		if subtle.ConstantTimeCompare([]byte(token), []byte(a.ServiceToken)) != 1 {
			writeErr(w, r, domainerr.Unauthorized("Invalid service token"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *InternalAPI) signingMaterial(w http.ResponseWriter, r *http.Request) {
	companyID, err := uuid.Parse(chi.URLParam(r, "company_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_company_id", "Invalid company_id"))
		return
	}
	var body struct {
		OrganizationID string `json:"organization_id"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	orgID, err := uuid.Parse(body.OrganizationID)
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "organization_id is required"))
		return
	}

	pfx, cert, err := a.Certificates.ExportSigningMaterial(r.Context(), orgID, companyID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	defer func() {
		for i := range pfx {
			pfx[i] = 0
		}
	}()

	// pfx_base64 is always password-less (empty PKCS#12 password) — both
	// CertificateStore implementations guarantee this, so nfe-gateway never
	// needs a password field here. It still needs materializing as a local
	// file before handing it to PyNFe: pynfe.entidades.certificado.
	// CertificadoA1 always reads its PFX from a filesystem path, never from
	// bytes (see nfe-gateway/src/nfe_gateway/sefaz/client.py).
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"pfx_base64": base64.StdEncoding.EncodeToString(pfx),
		"thumbprint": cert.Thumbprint,
		"not_after":  cert.NotAfter,
	})
}
