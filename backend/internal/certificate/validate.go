package certificate

import (
	"crypto/x509"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"software.sslmate.com/src/go-pkcs12"
)

// maxPFXSizeBytes bounds the upload: real A1 bundles are a few KB, so
// anything past this is rejected before it is even parsed.
const maxPFXSizeBytes = 32 * 1024

var subjectCNPJ = regexp.MustCompile(`(\d{14})\s*$`)

// ParseA1Certificate decodes a PKCS#12 (.pfx/.p12) file with its import
// password and validates it locally before anything is sent to Key Vault —
// this fails fast on a wrong password or a non-certificate file, and lets us
// read display metadata (subject, issuer, validity) from the certificate
// itself instead of trusting client-supplied fields.
func ParseA1Certificate(pfx []byte, password string) (*x509.Certificate, error) {
	if len(pfx) == 0 {
		return nil, domainerr.Validation("invalid_certificate", "certificate file is required")
	}
	if len(pfx) > maxPFXSizeBytes {
		return nil, domainerr.Validation("invalid_certificate", "certificate file is too large to be a valid A1 certificate")
	}
	// DecodeChain, not Decode: a real e-CNPJ PFX from at least one CA
	// (Certisign) bundles the full chain (leaf + intermediate + root, 3+
	// safe bags) — both this package's plain Decode and the older
	// golang.org/x/crypto/pkcs12 (frozen, this file used to import it)
	// hard-fail with "expected exactly two safe bags" on that shape.
	// Confirmed against a real LS Mtron Brasil certificate, not assumed.
	_, cert, _, err := pkcs12.DecodeChain(pfx, password)
	if err != nil {
		return nil, domainerr.Validation("invalid_certificate", "could not decode the certificate file — check the file and password")
	}
	if cert == nil {
		return nil, domainerr.Validation("invalid_certificate", "certificate file does not contain a certificate")
	}
	if !cert.IsCA && cert.KeyUsage&x509.KeyUsageDigitalSignature == 0 {
		return nil, domainerr.Validation("invalid_certificate", "certificate does not support digital signature")
	}
	now := time.Now().UTC()
	if now.After(cert.NotAfter) {
		return nil, domainerr.Validation("certificate_expired", fmt.Sprintf("certificate expired at %s", cert.NotAfter.Format(time.RFC3339)))
	}
	if now.Before(cert.NotBefore) {
		return nil, domainerr.Validation("certificate_not_yet_valid", fmt.Sprintf("certificate is not valid before %s", cert.NotBefore.Format(time.RFC3339)))
	}
	return cert, nil
}

// CertificateCNPJ extracts the CNPJ embedded in an ICP-Brasil e-CNPJ
// certificate's Common Name (formatted as "RAZAO SOCIAL:14211858000107").
// The second return value is false when the CN does not carry a CNPJ suffix
// (e.g. an e-CPF certificate) — DOC-ICP-04 mandates this CN format for
// e-CNPJ certificates, so a certificate that doesn't match it either isn't
// an e-CNPJ certificate at all or is malformed; callers should reject the
// upload in that case, not silently skip the check.
func CertificateCNPJ(commonName string) (string, bool) {
	m := subjectCNPJ.FindStringSubmatch(commonName)
	if m == nil {
		return "", false
	}
	return m[1], true
}

// CertificateUF extracts the state (UF) from an ICP-Brasil certificate's
// Subject ST field — e.g. a real e-CNPJ cert's subject looks like
// "/C=BR/ST=RJ/L=NITEROI/O=ICP-Brasil/OU=.../CN=EMPRESA:CNPJ" (confirmed
// against real-world examples, not assumed). ST is standard across
// certificate authorities for e-CNPJ certs, unlike the CNPJ-in-SAN OtherName
// extension (2.16.76.1.3.3), which DOC-ICP-04 marks optional per issuing
// AC policy — CN and ST are the two fields worth relying on here.
func CertificateUF(subjectProvince []string) (string, bool) {
	if len(subjectProvince) == 0 {
		return "", false
	}
	uf := strings.ToUpper(strings.TrimSpace(subjectProvince[0]))
	if len(uf) != 2 {
		return "", false
	}
	return uf, true
}
