package certificate_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/nexus/fiscal-messaging/internal/certificate"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/test/helpers"
	"software.sslmate.com/src/go-pkcs12"
)

func TestParseA1CertificateRejectsEmptyFile(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate(nil, "any")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
	helpers.AssertDomainStatus(t, err, 422)
}

func TestParseA1CertificateRejectsOversizedFile(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate(make([]byte, 200*1024), "any")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
}

func TestParseA1CertificateRejectsGarbage(t *testing.T) {
	t.Parallel()
	_, err := certificate.ParseA1Certificate([]byte("not a real pfx file"), "wrong-password")
	helpers.AssertDomainCode(t, err, "invalid_certificate")
}

func TestPrepareA1UploadRejectsWrongPassword(t *testing.T) {
	t.Parallel()

	pfx, password := mustSyntheticA1PFX(t, "EMPRESA TESTE:11222333000181", "SP", false)
	_, err := certificate.PrepareA1Upload(pfx, password+"nope")
	if err == nil {
		t.Fatal("expected wrong password to fail")
	}
	var de *domainerr.Error
	if !errors.As(err, &de) {
		t.Fatalf("expected domainerr, got %T (%v)", err, err)
	}
	if de.Code != "invalid_certificate_password" && de.Code != "invalid_certificate" {
		t.Fatalf("code=%q, want invalid_certificate_password or invalid_certificate", de.Code)
	}
}

func TestPrepareA1UploadAcceptsSyntheticA1(t *testing.T) {
	t.Parallel()

	pfx, password := mustSyntheticA1PFX(t, "EMPRESA TESTE:11222333000181", "SP", false)
	prepared, err := certificate.PrepareA1Upload(pfx, password)
	if err != nil {
		t.Fatalf("PrepareA1Upload: %v", err)
	}
	if prepared.Certificate == nil {
		t.Fatal("expected leaf certificate")
	}
	if len(prepared.PFX) == 0 {
		t.Fatal("expected canonical PFX bytes")
	}
	cnpj, ok := certificate.CertificateCNPJ(prepared.Certificate.Subject.CommonName)
	if !ok || cnpj != "11222333000181" {
		t.Fatalf("cnpj=%s ok=%v", cnpj, ok)
	}
}

func TestPrepareA1UploadFixesReversedChainOrder(t *testing.T) {
	t.Parallel()

	leafKey, leaf, ca := mustLeafAndCA(t, "EMPRESA TESTE:11222333000181", "RJ")
	password := "test1234"
	// CA as first cert bag — DecodeChain would treat it as the leaf.
	reversed, err := pkcs12.LegacyDES.Encode(leafKey, ca, []*x509.Certificate{leaf}, password)
	if err != nil {
		t.Fatalf("encode reversed: %v", err)
	}

	prepared, err := certificate.PrepareA1Upload(reversed, password)
	if err != nil {
		t.Fatalf("PrepareA1Upload: %v", err)
	}
	if prepared.Certificate.Subject.CommonName != leaf.Subject.CommonName {
		t.Fatalf("leaf CN=%q, want %q", prepared.Certificate.Subject.CommonName, leaf.Subject.CommonName)
	}
	cnpj, ok := certificate.CertificateCNPJ(prepared.Certificate.Subject.CommonName)
	if !ok || cnpj != "11222333000181" {
		t.Fatalf("cnpj=%s ok=%v", cnpj, ok)
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

func mustSyntheticA1PFX(t *testing.T, cn, uf string, withCA bool) (pfx []byte, password string) {
	t.Helper()
	password = "test1234"
	key, leaf, ca := mustLeafAndCA(t, cn, uf)
	var err error
	if withCA {
		pfx, err = pkcs12.LegacyDES.Encode(key, leaf, []*x509.Certificate{ca}, password)
	} else {
		pfx, err = pkcs12.LegacyDES.Encode(key, leaf, nil, password)
	}
	if err != nil {
		t.Fatalf("encode pfx: %v", err)
	}
	return pfx, password
}

func mustLeafAndCA(t *testing.T, cn, uf string) (*rsa.PrivateKey, *x509.Certificate, *x509.Certificate) {
	t.Helper()

	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("ca key: %v", err)
	}
	caTmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Test CA", Organization: []string{"ICP-Brasil"}, Country: []string{"BR"}},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, caTmpl, caTmpl, &caKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create ca: %v", err)
	}
	caCert, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatalf("parse ca: %v", err)
	}

	leafKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("leaf key: %v", err)
	}
	leafTmpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			CommonName:   cn,
			Organization: []string{"ICP-Brasil"},
			Country:      []string{"BR"},
			Province:     []string{uf},
		},
		NotBefore: time.Now().Add(-time.Hour),
		NotAfter:  time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:  x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageClientAuth,
			x509.ExtKeyUsageEmailProtection,
		},
	}
	leafDER, err := x509.CreateCertificate(rand.Reader, leafTmpl, caCert, &leafKey.PublicKey, caKey)
	if err != nil {
		t.Fatalf("create leaf: %v", err)
	}
	leafCert, err := x509.ParseCertificate(leafDER)
	if err != nil {
		t.Fatalf("parse leaf: %v", err)
	}
	return leafKey, leafCert, caCert
}
