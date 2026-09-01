package keyvault_test

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
	"github.com/nexus/fiscal-messaging/test/helpers"
	"software.sslmate.com/src/go-pkcs12"
)

const testPFXPassword = "test1234"

func testEncryptionKey() []byte {
	return bytes.Repeat([]byte{0x42}, 32)
}

func TestNewLocalFileCertificateStoreRejectsShortKey(t *testing.T) {
	t.Parallel()

	_, err := keyvault.NewLocalFileCertificateStore(t.TempDir(), []byte("too-short"))
	if err == nil {
		t.Fatal("expected an error for a non-32-byte key")
	}
}

func TestLocalFileCertificateStoreExportMissingReturnsNotConfigured(t *testing.T) {
	t.Parallel()

	store, err := keyvault.NewLocalFileCertificateStore(t.TempDir(), testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.ExportCertificate(context.Background(), "cert-never-imported")
	if err != keyvault.ErrNotConfigured {
		t.Fatalf("err=%v, want ErrNotConfigured", err)
	}
}

func TestLocalFileCertificateStoreImportRejectsGarbage(t *testing.T) {
	t.Parallel()

	store, err := keyvault.NewLocalFileCertificateStore(t.TempDir(), testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.ImportCertificate(context.Background(), "cert-garbage", []byte("not a pfx"), "whatever")
	if err == nil {
		t.Fatal("expected an error decoding a non-PFX payload")
	}
}

func TestLocalFileCertificateStoreImportExportRoundTrip(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1.pfx")
	store, err := keyvault.NewLocalFileCertificateStore(t.TempDir(), testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}

	info, err := store.ImportCertificate(context.Background(), "cert-roundtrip", pfx, testPFXPassword)
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if info.Thumbprint == "" {
		t.Fatal("expected a non-empty thumbprint")
	}
	if info.NotAfter.Before(info.NotBefore) {
		t.Fatalf("not_after (%s) before not_before (%s)", info.NotAfter, info.NotBefore)
	}

	exported, err := store.ExportCertificate(context.Background(), "cert-roundtrip")
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	// The store re-encodes on import (see local.go), so the exported bytes
	// are never byte-identical to the source PFX — what must hold is the
	// CertificateStore.ExportCertificate contract: password-less (decodes
	// with ""), and the same certificate material.
	_, exportedCert, err := pkcs12.Decode(exported, "")
	if err != nil {
		t.Fatalf("exported PFX did not decode with an empty password (not password-less): %v", err)
	}
	sum := sha1.Sum(exportedCert.Raw)
	exportedThumbprint := hex.EncodeToString(sum[:])
	if !bytes.EqualFold([]byte(info.Thumbprint), []byte(exportedThumbprint)) {
		t.Fatalf("exported certificate thumbprint changed: import returned %s, export decodes to %s", info.Thumbprint, exportedThumbprint)
	}
}

// TestLocalFileCertificateStoreImportAcceptsFullChainPFX is the same
// regression covered in certificate.ParseA1Certificate's tests, for this
// store's own separate decode call — a real e-CNPJ PFX bundling the full CA
// chain (3+ safe bags) must import successfully, not fail with "expected
// exactly two safe bags".
func TestLocalFileCertificateStoreImportAcceptsFullChainPFX(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1_chain.pfx")
	store, err := keyvault.NewLocalFileCertificateStore(t.TempDir(), testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}

	info, err := store.ImportCertificate(context.Background(), "cert-chain", pfx, testPFXPassword)
	if err != nil {
		t.Fatalf("expected a full-chain PFX to import, got: %v", err)
	}
	if info.Thumbprint == "" {
		t.Fatal("expected a non-empty thumbprint")
	}

	// The chain (caCerts) must survive re-encoding, not just the leaf+key.
	exported, err := store.ExportCertificate(context.Background(), "cert-chain")
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	_, _, caCerts, err := pkcs12.DecodeChain(exported, "")
	if err != nil {
		t.Fatalf("exported PFX did not decode: %v", err)
	}
	if len(caCerts) != 2 {
		t.Fatalf("caCerts=%d, want 2 (the chain should survive re-encoding)", len(caCerts))
	}
}

func TestLocalFileCertificateStoreDisableRemovesFile(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1.pfx")
	dir := t.TempDir()
	store, err := keyvault.NewLocalFileCertificateStore(dir, testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ImportCertificate(context.Background(), "cert-disable", pfx, testPFXPassword); err != nil {
		t.Fatal(err)
	}

	if err := store.DisableCertificate(context.Background(), "cert-disable"); err != nil {
		t.Fatalf("disable: %v", err)
	}

	if _, err := store.ExportCertificate(context.Background(), "cert-disable"); err != keyvault.ErrNotConfigured {
		t.Fatalf("err after disable=%v, want ErrNotConfigured", err)
	}

	// Disabling something never imported must be a no-op, not an error —
	// certificate.Service.RevokeCertificate only calls this once per row.
	if err := store.DisableCertificate(context.Background(), "cert-never-existed"); err != nil {
		t.Fatalf("disable missing: %v", err)
	}
}

func TestLocalFileCertificateStorePFXEncryptedAtRest(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1.pfx")
	dir := t.TempDir()
	store, err := keyvault.NewLocalFileCertificateStore(dir, testEncryptionKey())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.ImportCertificate(context.Background(), "cert-encrypted", pfx, testPFXPassword); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(filepath.Join(dir, "cert-encrypted.enc"))
	if err != nil {
		t.Fatalf("read stored file: %v", err)
	}
	if bytes.Contains(raw, pfx[:64]) {
		t.Fatal("stored file contains the raw PFX bytes in the clear — not encrypted at rest")
	}
}
