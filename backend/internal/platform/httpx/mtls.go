package httpx

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// MTLSServerConfig builds a tls.Config that requires client certificates
// signed by the CA in clientCAFile. Used by internal_api when
// INTERNAL_API_TLS_CLIENT_CA_FILE is set alongside cert/key files.
func MTLSServerConfig(clientCAFile string) (*tls.Config, error) {
	pem, err := os.ReadFile(clientCAFile)
	if err != nil {
		return nil, fmt.Errorf("read client CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("parse client CA PEM: no certificates found")
	}
	return &tls.Config{
		ClientCAs:  pool,
		ClientAuth: tls.RequireAndVerifyClientCert,
		MinVersion: tls.VersionTLS12,
	}, nil
}
