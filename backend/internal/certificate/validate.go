package certificate

import (
	"regexp"
	"strings"
)

var subjectCNPJ = regexp.MustCompile(`(\d{14})\s*$`)

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
