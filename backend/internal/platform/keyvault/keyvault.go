package keyvault

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azcertificates"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets"
)

// ErrNotConfigured is returned by the unconfigured store so callers can
// surface a clear "certificate storage unavailable" error instead of a nil
// pointer panic when AZURE_KEY_VAULT_URL is not set.
var ErrNotConfigured = errors.New("key vault is not configured")

// CertificateInfo is the metadata handed back after a certificate is stored
// in Key Vault. The private key never leaves Key Vault and is never part of
// this struct.
type CertificateInfo struct {
	// CertificateID is the fully-qualified, versioned Key Vault identifier
	// (https://{vault}.vault.azure.net/certificates/{name}/{version}) used to
	// retrieve this exact certificate/key version for signing later on.
	CertificateID string
	Thumbprint    string
	NotBefore     time.Time
	NotAfter      time.Time
}

// CertificateStore stores and retires X.509 certificates (with their private
// key) in an external vault. Implementations must never persist the raw
// certificate bytes or import password anywhere outside the vault call.
type CertificateStore interface {
	// ImportCertificate stores a PFX (PKCS#12) certificate under name.
	ImportCertificate(ctx context.Context, name string, pfx []byte, password string) (*CertificateInfo, error)
	// DisableCertificate marks a previously imported certificate as disabled
	// so it can no longer be retrieved for signing.
	DisableCertificate(ctx context.Context, name string) error
	// ExportCertificate retrieves the full PFX (certificate + private key)
	// previously imported under name, for a caller that needs to actually
	// sign something with it (the nfe-gateway service, via the internal
	// signing-material endpoint — see
	// docs/architecture/22_nfe_gateway_service.md). Every implementation
	// guarantees the returned PFX is password-less (still encrypted, just
	// with an empty password) — the caller never learns or needs the
	// original import password. The returned bytes are as sensitive as a
	// private key and must never be persisted by the caller.
	ExportCertificate(ctx context.Context, name string) ([]byte, error)
}

// AzureCertificateStore stores certificates in Azure Key Vault.
type AzureCertificateStore struct {
	certs   *azcertificates.Client
	secrets *azsecrets.Client
}

// NewAzureCertificateStore builds Key Vault clients for vaultURL
// (https://{vault-name}.vault.azure.net) authenticating with
// DefaultAzureCredential (managed identity in Azure, `az login` locally).
// Two clients are needed because an exportable certificate's private key is
// only retrievable through the Secrets API — the Certificates API never
// returns key material, by design.
func NewAzureCertificateStore(vaultURL string) (*AzureCertificateStore, error) {
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, fmt.Errorf("create azure credential: %w", err)
	}
	certs, err := azcertificates.NewClient(vaultURL, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("create key vault certificates client: %w", err)
	}
	secrets, err := azsecrets.NewClient(vaultURL, cred, nil)
	if err != nil {
		return nil, fmt.Errorf("create key vault secrets client: %w", err)
	}
	return &AzureCertificateStore{certs: certs, secrets: secrets}, nil
}

func (s *AzureCertificateStore) ImportCertificate(ctx context.Context, name string, pfx []byte, password string) (*CertificateInfo, error) {
	encoded := base64.StdEncoding.EncodeToString(pfx)
	params := azcertificates.ImportCertificateParameters{
		Base64EncodedCertificate: &encoded,
	}
	if password != "" {
		params.Password = &password
	}
	resp, err := s.certs.ImportCertificate(ctx, name, params, nil)
	if err != nil {
		return nil, fmt.Errorf("import certificate into key vault: %w", err)
	}
	if resp.ID == nil {
		return nil, fmt.Errorf("key vault did not return a certificate identifier")
	}

	info := &CertificateInfo{CertificateID: string(*resp.ID)}
	if resp.Attributes != nil {
		if resp.Attributes.NotBefore != nil {
			info.NotBefore = *resp.Attributes.NotBefore
		}
		if resp.Attributes.Expires != nil {
			info.NotAfter = *resp.Attributes.Expires
		}
	}
	if len(resp.X509Thumbprint) > 0 {
		info.Thumbprint = strings.ToUpper(hex.EncodeToString(resp.X509Thumbprint))
	}
	return info, nil
}

func (s *AzureCertificateStore) DisableCertificate(ctx context.Context, name string) error {
	enabled := false
	_, err := s.certs.UpdateCertificate(ctx, name, "", azcertificates.UpdateCertificateParameters{
		CertificateAttributes: &azcertificates.CertificateAttributes{Enabled: &enabled},
	}, nil)
	if err != nil {
		return fmt.Errorf("disable certificate in key vault: %w", err)
	}
	return nil
}

// ExportCertificate retrieves the PFX through the secret Key Vault creates
// automatically alongside every exportable certificate, under the same
// name — that secret's value is the base64-encoded PKCS#12 blob, with no
// separate password (Key Vault re-exports it password-less).
func (s *AzureCertificateStore) ExportCertificate(ctx context.Context, name string) ([]byte, error) {
	resp, err := s.secrets.GetSecret(ctx, name, "", nil)
	if err != nil {
		return nil, fmt.Errorf("get certificate secret from key vault: %w", err)
	}
	if resp.Value == nil {
		return nil, fmt.Errorf("key vault returned no secret value for certificate %q", name)
	}
	pfx, err := base64.StdEncoding.DecodeString(*resp.Value)
	if err != nil {
		return nil, fmt.Errorf("decode certificate secret: %w", err)
	}
	return pfx, nil
}

// unconfiguredStore lets the application boot without AZURE_KEY_VAULT_URL
// set (e.g. local development); any actual certificate operation fails with
// ErrNotConfigured instead of the process panicking on a nil client.
type unconfiguredStore struct{}

// NewUnconfiguredStore returns a CertificateStore whose operations always
// fail with ErrNotConfigured.
func NewUnconfiguredStore() CertificateStore { return unconfiguredStore{} }

func (unconfiguredStore) ImportCertificate(context.Context, string, []byte, string) (*CertificateInfo, error) {
	return nil, ErrNotConfigured
}

func (unconfiguredStore) DisableCertificate(context.Context, string) error {
	return ErrNotConfigured
}

func (unconfiguredStore) ExportCertificate(context.Context, string) ([]byte, error) {
	return nil, ErrNotConfigured
}
