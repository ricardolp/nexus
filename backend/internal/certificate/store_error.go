package certificate

import (
	"errors"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
)

// wrapStoreError turns Key Vault / local-store failures into a 503 the
// client can act on, instead of a generic 500. Azure AD "client secret
// expired" (AADSTS7000222) is the one we have actually seen in production
// — leaking the raw AAD body to the browser would expose tenant internals
// without helping the operator.
func WrapStoreError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, keyvault.ErrNotConfigured) {
		return domainerr.New(503, "certificate_storage_unavailable", "Service Unavailable", "Certificate storage is not configured")
	}
	msg := err.Error()
	switch {
	case strings.Contains(msg, "AADSTS7000222"):
		return domainerr.New(503, "certificate_storage_unavailable", "Service Unavailable",
			"Azure Key Vault authentication failed: the application client secret has expired. Create a new secret in Azure AD and update AZURE_CLIENT_SECRET.")
	case strings.Contains(msg, "failed to acquire a token"),
		strings.Contains(msg, "DefaultAzureCredential"):
		return domainerr.New(503, "certificate_storage_unavailable", "Service Unavailable",
			"Azure Key Vault authentication failed. Check AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID.")
	default:
		return err
	}
}
