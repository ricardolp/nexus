package certificate_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestParseA1CertificateRejectsEmptyFile(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate(nil, "any")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
	helpers.AssertDomainStatus(t, err, 422)
}

func TestParseA1CertificateRejectsOversizedFile(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate(make([]byte, 40*1024), "any")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
}

func TestParseA1CertificateRejectsGarbage(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate([]byte("not a real pfx file"), "wrong-password")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
}

func TestParseA1CertificateExtractsRealICPBrasilSubjectFields(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1_sp.pfx")
	cert, err := certificate.ParseA1Certificate(pfx, "test1234")
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	cnpj, ok := certificate.CertificateCNPJ(cert.Subject.CommonName)
	if !ok || cnpj != "11222333000181" {
		t.Fatalf("cnpj=%s ok=%v, want 11222333000181/true", cnpj, ok)
	}

	uf, ok := certificate.CertificateUF(cert.Subject.Province)
	if !ok || uf != "SP" {
		t.Fatalf("uf=%s ok=%v, want SP/true", uf, ok)
	}
}

// TestParseA1CertificateAcceptsFullChainPFX is a regression test for a real
// bug: some CAs (confirmed with a real Certisign-issued e-CNPJ certificate)
// export the leaf cert bundled with the full CA chain (3+ safe bags), which
// both golang.org/x/crypto/pkcs12 and this package's plain Decode() reject
// outright with "expected exactly two safe bags in the PFX PDU" — despite
// the password being correct. ParseA1Certificate must use DecodeChain, not
// Decode, or every certificate from a CA that bundles its chain fails to
// upload with a misleading "check the file and password" error.
func TestParseA1CertificateAcceptsFullChainPFX(t *testing.T) {
	t.Parallel()

	pfx := helpers.ReadTestdata(t, "certificate", "test_a1_chain.pfx")
	cert, err := certificate.ParseA1Certificate(pfx, "test1234")
	if err != nil {
		t.Fatalf("expected a full-chain PFX to parse, got: %v", err)
	}

	cnpj, ok := certificate.CertificateCNPJ(cert.Subject.CommonName)
	if !ok || cnpj != "11222333000181" {
		t.Fatalf("cnpj=%s ok=%v, want 11222333000181/true", cnpj, ok)
	}
	uf, ok := certificate.CertificateUF(cert.Subject.Province)
	if !ok || uf != "SC" {
		t.Fatalf("uf=%s ok=%v, want SC/true", uf, ok)
	}
}

func TestCertificateCNPJRejectsMissingSuffix(t *testing.T) {
	t.Parallel()

	if _, ok := certificate.CertificateCNPJ("JOAO DA SILVA:12345678900"); ok {
		t.Fatal("expected an e-CPF-shaped CN (11 digits) not to parse as a CNPJ")
	}
	if _, ok := certificate.CertificateCNPJ("SOME RANDOM COMMON NAME"); ok {
		t.Fatal("expected a CN with no trailing digits not to parse")
	}
}

func TestCertificateUFRejectsMissingOrMalformed(t *testing.T) {
	t.Parallel()

	if _, ok := certificate.CertificateUF(nil); ok {
		t.Fatal("expected no Province values not to parse")
	}
	if _, ok := certificate.CertificateUF([]string{"Sao Paulo"}); ok {
		t.Fatal("expected a full state name (not a 2-letter code) not to parse")
	}
}

func TestCertificateUFNormalizesCase(t *testing.T) {
	t.Parallel()

	uf, ok := certificate.CertificateUF([]string{"sp"})
	if !ok || uf != "SP" {
		t.Fatalf("uf=%s ok=%v, want SP/true", uf, ok)
	}
}
