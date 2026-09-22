package certificate

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/x509"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"software.sslmate.com/src/go-pkcs12"
)

// maxPFXSizeBytes bounds the upload: real A1 bundles are a few KB to ~tens
// of KB with the full CA chain. Anything past this is rejected before parse.
const maxPFXSizeBytes = 128 * 1024

// PreparedA1 is a PFX the rest of the stack can always DecodeChain, plus the
// leaf certificate metadata used for CNPJ/UF checks.
type PreparedA1 struct {
	Certificate *x509.Certificate
	// PFX is a canonical re-encode (leaf first, go-pkcs12 Modern) so local
	// store / Key Vault import never see Windows bag-order quirks.
	PFX      []byte
	Password string
}

// PrepareA1Upload decodes a user-supplied PKCS#12 (.pfx/.p12) for upload.
// Windows / AC exports sometimes fail go-pkcs12.DecodeChain even with the
// correct password; when that happens we transparently re-export via
// OpenSSL into a format DecodeChain accepts so end users never need to
// run openssl themselves.
func PrepareA1Upload(pfx []byte, password string) (*PreparedA1, error) {
	if len(pfx) == 0 {
		return nil, domainerr.Validation("invalid_certificate", "certificate file is required")
	}
	if len(pfx) > maxPFXSizeBytes {
		return nil, domainerr.Validation("invalid_certificate", "certificate file is too large to be a valid A1 certificate")
	}
	password = strings.TrimSpace(password)

	key, cert, caCerts, err := decodePFX(pfx, password)
	if err != nil {
		// Do not trust ErrIncorrectPassword alone: some Windows/AC exports
		// fail MAC verification in go-pkcs12 but open fine with OpenSSL
		// -legacy. Always attempt normalize once before blaming the user.
		normalized, normErr := opensslNormalizePFX(context.Background(), pfx, password)
		if normErr != nil {
			if errors.Is(normErr, errOpenSSLUnavailable) {
				if errors.Is(err, pkcs12.ErrIncorrectPassword) {
					return nil, domainerr.Validation("invalid_certificate_password", "senha do certificado incorreta")
				}
				return nil, domainerr.Validation("invalid_certificate",
					"não foi possível ler o certificado — confira a senha. Se a senha estiver correta, tente novamente em alguns minutos ou fale com o suporte.")
			}
			if isOpenSSLBadPassword(normErr) || errors.Is(err, pkcs12.ErrIncorrectPassword) {
				return nil, domainerr.Validation("invalid_certificate_password", "senha do certificado incorreta")
			}
			return nil, domainerr.Validation("invalid_certificate",
				"não foi possível ler o arquivo do certificado — confira se é um A1 (.pfx/.p12) válido e se a senha está correta")
		}

		key, cert, caCerts, err = decodePFX(normalized, password)
		if err != nil {
			if errors.Is(err, pkcs12.ErrIncorrectPassword) {
				return nil, domainerr.Validation("invalid_certificate_password", "senha do certificado incorreta")
			}
			return nil, domainerr.Validation("invalid_certificate",
				"não foi possível ler o arquivo do certificado — confira se é um A1 (.pfx/.p12) válido e se a senha está correta")
		}
	}

	cert, caCerts = selectLeafForKey(key, cert, caCerts)
	if err := validateA1Leaf(cert); err != nil {
		return nil, err
	}

	// Always re-encode so bag order is leaf-first and downstream DecodeChain
	// (local store) sees a known-good bundle.
	canonical, err := pkcs12.Modern.Encode(key, cert, caCerts, password)
	if err != nil {
		return nil, domainerr.Validation("invalid_certificate", "could not normalize the certificate file for storage")
	}
	return &PreparedA1{Certificate: cert, PFX: canonical, Password: password}, nil
}

// ParseA1Certificate keeps the previous helper surface for unit tests that
// only need the leaf certificate.
func ParseA1Certificate(pfx []byte, password string) (*x509.Certificate, error) {
	prepared, err := PrepareA1Upload(pfx, password)
	if err != nil {
		return nil, err
	}
	return prepared.Certificate, nil
}

func decodePFX(pfx []byte, password string) (privateKey any, cert *x509.Certificate, caCerts []*x509.Certificate, err error) {
	// DecodeChain, not Decode: a real e-CNPJ PFX from at least one CA
	// (Certisign) bundles the full chain (leaf + intermediate + root, 3+
	// safe bags) — plain Decode hard-fails with "expected exactly two safe
	// bags" on that shape.
	return pkcs12.DecodeChain(pfx, password)
}

func validateA1Leaf(cert *x509.Certificate) error {
	if cert == nil {
		return domainerr.Validation("invalid_certificate", "certificate file does not contain a certificate")
	}
	if !cert.IsCA && cert.KeyUsage&x509.KeyUsageDigitalSignature == 0 {
		return domainerr.Validation("invalid_certificate", "certificate does not support digital signature")
	}
	now := time.Now().UTC()
	if now.After(cert.NotAfter) {
		return domainerr.Validation("certificate_expired", fmt.Sprintf("certificate expired at %s", cert.NotAfter.Format(time.RFC3339)))
	}
	if now.Before(cert.NotBefore) {
		return domainerr.Validation("certificate_not_yet_valid", fmt.Sprintf("certificate is not valid before %s", cert.NotBefore.Format(time.RFC3339)))
	}
	return nil
}

// selectLeafForKey fixes Windows/Azure PFX bag order where DecodeChain may
// return a CA as the "leaf" (first cert bag) while the real leaf sits in
// the chain. See SSLMate/go-pkcs12#54.
func selectLeafForKey(key any, cert *x509.Certificate, caCerts []*x509.Certificate) (*x509.Certificate, []*x509.Certificate) {
	if cert == nil || key == nil || certMatchesKey(key, cert) {
		return cert, caCerts
	}
	for i, candidate := range caCerts {
		if !certMatchesKey(key, candidate) {
			continue
		}
		rest := make([]*x509.Certificate, 0, len(caCerts))
		rest = append(rest, cert)
		rest = append(rest, caCerts[:i]...)
		rest = append(rest, caCerts[i+1:]...)
		return candidate, rest
	}
	return cert, caCerts
}

func certMatchesKey(key any, cert *x509.Certificate) bool {
	if cert == nil {
		return false
	}
	switch k := key.(type) {
	case *rsa.PrivateKey:
		pub, ok := cert.PublicKey.(*rsa.PublicKey)
		return ok && k.PublicKey.N.Cmp(pub.N) == 0 && k.PublicKey.E == pub.E
	case *ecdsa.PrivateKey:
		pub, ok := cert.PublicKey.(*ecdsa.PublicKey)
		return ok && k.X.Cmp(pub.X) == 0 && k.Y.Cmp(pub.Y) == 0 && k.Curve == pub.Curve
	case crypto.Signer:
		pub := k.Public()
		switch p := pub.(type) {
		case *rsa.PublicKey:
			cp, ok := cert.PublicKey.(*rsa.PublicKey)
			return ok && p.N.Cmp(cp.N) == 0 && p.E == cp.E
		case *ecdsa.PublicKey:
			cp, ok := cert.PublicKey.(*ecdsa.PublicKey)
			return ok && p.X.Cmp(cp.X) == 0 && p.Y.Cmp(cp.Y) == 0 && p.Curve == cp.Curve
		}
	}
	return false
}

var errOpenSSLUnavailable = errors.New("openssl not available")

func opensslNormalizePFX(ctx context.Context, pfx []byte, password string) ([]byte, error) {
	if _, err := exec.LookPath("openssl"); err != nil {
		return nil, errOpenSSLUnavailable
	}

	dir, err := os.MkdirTemp("", "nexus-pfx-*")
	if err != nil {
		return nil, fmt.Errorf("create temp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(dir) }()

	inPath := filepath.Join(dir, "in.pfx")
	pemPath := filepath.Join(dir, "material.pem")
	outPath := filepath.Join(dir, "out.pfx")
	passPath := filepath.Join(dir, "pass.txt")

	if err := os.WriteFile(inPath, pfx, 0o600); err != nil {
		return nil, fmt.Errorf("write input pfx: %w", err)
	}
	// OpenSSL "file:" passin includes a trailing newline as part of the
	// password on some builds — write raw bytes with no newline.
	if err := os.WriteFile(passPath, []byte(password), 0o600); err != nil {
		return nil, fmt.Errorf("write password file: %w", err)
	}

	extract := func(legacy bool) error {
		args := []string{
			"pkcs12", "-in", inPath, "-out", pemPath, "-nodes",
			"-passin", "file:" + passPath,
		}
		if legacy {
			args = append(args, "-legacy")
		}
		cmd := exec.CommandContext(ctx, "openssl", args...)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
		}
		return nil
	}

	// Prefer -legacy first: Brazilian ACs and Windows still ship RC2/3DES
	// bags that OpenSSL 3 rejects without the legacy provider.
	if err := extract(true); err != nil {
		_ = os.Remove(pemPath)
		if err2 := extract(false); err2 != nil {
			return nil, fmt.Errorf("openssl extract: %w", err2)
		}
	}

	exportArgs := []string{
		"pkcs12", "-export",
		"-in", pemPath,
		"-out", outPath,
		"-passin", "file:" + passPath,
		"-passout", "file:" + passPath,
	}
	cmd := exec.CommandContext(ctx, "openssl", exportArgs...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("openssl export: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	out, err := os.ReadFile(outPath)
	if err != nil {
		return nil, fmt.Errorf("read normalized pfx: %w", err)
	}
	if len(out) == 0 {
		return nil, errors.New("openssl produced an empty pfx")
	}
	return out, nil
}

func isOpenSSLBadPassword(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "mac verify error") ||
		strings.Contains(msg, "invalid password") ||
		strings.Contains(msg, "password incorrect") ||
		(strings.Contains(msg, "pkcs12 routines") && strings.Contains(msg, "mac"))
}
