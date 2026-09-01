package keyvault

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"software.sslmate.com/src/go-pkcs12"
)

// LocalFileCertificateStore is the "ou local" half of the certificate
// storage described in docs/architecture/22_nfe_gateway_service.md — a
// CertificateStore for environments without Azure Key Vault (local dev,
// on-prem), so ImportCertificate/ExportCertificate work end-to-end without
// depending on Azure at all. The PFX is encrypted at rest with the same
// AES-256-GCM helper (SECRETS_ENCRYPTION_KEY) already used for
// organization_integrations.client_secret — never written in the clear —
// and, like AzureCertificateStore, always exports password-less: see
// CertificateStore.ExportCertificate.
type LocalFileCertificateStore struct {
	baseDir string
	key     []byte
}

// NewLocalFileCertificateStore stores encrypted PFX files under baseDir
// (created if missing). key must be 32 bytes (see crypto.Encrypt) — callers
// should refuse to build this store at all without SECRETS_ENCRYPTION_KEY
// set, same as the rest of the app already does for encrypted-at-rest data.
func NewLocalFileCertificateStore(baseDir string, key []byte) (*LocalFileCertificateStore, error) {
	if len(key) != 32 {
		return nil, errors.New("SECRETS_ENCRYPTION_KEY (32 bytes) is required for the local certificate store")
	}
	if err := os.MkdirAll(baseDir, 0o700); err != nil {
		return nil, fmt.Errorf("create local certificate store directory: %w", err)
	}
	return &LocalFileCertificateStore{baseDir: baseDir, key: key}, nil
}

func (s *LocalFileCertificateStore) path(name string) string {
	// name already comes from certificate.keyVaultCertificateName, which is
	// "cert-" + a hex UUID — no path traversal surface, but strip any path
	// separators anyway rather than trust that invariant here too.
	safe := strings.NewReplacer("/", "_", "\\", "_", "..", "_").Replace(name)
	return filepath.Join(s.baseDir, safe+".enc")
}

func (s *LocalFileCertificateStore) ImportCertificate(_ context.Context, name string, pfx []byte, password string) (*CertificateInfo, error) {
	// DecodeChain, not Decode: some CAs (confirmed with a real e-CNPJ
	// certificate from Certisign) export the full chain — leaf + issuing +
	// root, 3+ safe bags — which the plain Decode rejects outright
	// ("expected exactly two safe bags"). See the same note in
	// internal/certificate/validate.go.
	key, cert, caCerts, err := pkcs12.DecodeChain(pfx, password)
	if err != nil {
		return nil, fmt.Errorf("decode certificate: %w", err)
	}

	// Re-encode password-less (empty password, still encrypted — the same
	// convention Azure Key Vault itself uses when it re-exports a
	// certificate's secret twin) so ExportCertificate's contract is
	// identical regardless of backend: whoever calls it (the nfe-gateway,
	// via the internal signing-material endpoint) never needs to know or
	// carry the original import password. Re-encoding once here, instead of
	// on every export, means storage — not every read — pays for it. The
	// chain (caCerts) is preserved rather than dropped, matching what the
	// original PFX actually contained.
	passwordless, err := pkcs12.Modern.Encode(key, cert, caCerts, "")
	if err != nil {
		return nil, fmt.Errorf("re-encode certificate password-less: %w", err)
	}

	encoded, err := crypto.Encrypt(s.key, passwordless)
	if err != nil {
		return nil, fmt.Errorf("encrypt certificate for local storage: %w", err)
	}
	if err := os.WriteFile(s.path(name), []byte(encoded), 0o600); err != nil {
		return nil, fmt.Errorf("write local certificate file: %w", err)
	}

	sum := sha1.Sum(cert.Raw)
	return &CertificateInfo{
		CertificateID: "local://" + name,
		Thumbprint:    strings.ToUpper(hex.EncodeToString(sum[:])),
		NotBefore:     cert.NotBefore.UTC(),
		NotAfter:      cert.NotAfter.UTC(),
	}, nil
}

func (s *LocalFileCertificateStore) DisableCertificate(_ context.Context, name string) error {
	// "Disabled" for the local store means gone — there is no separate
	// enabled/disabled flag to flip on a file, and the DB row already
	// records the certificate as revoked regardless of what the store does.
	if err := os.Remove(s.path(name)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove local certificate file: %w", err)
	}
	return nil
}

func (s *LocalFileCertificateStore) ExportCertificate(_ context.Context, name string) ([]byte, error) {
	raw, err := os.ReadFile(s.path(name))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotConfigured
		}
		return nil, fmt.Errorf("read local certificate file: %w", err)
	}
	pfx, err := crypto.Decrypt(s.key, string(raw))
	if err != nil {
		return nil, fmt.Errorf("decrypt local certificate file: %w", err)
	}
	return pfx, nil
}
