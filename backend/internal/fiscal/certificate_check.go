package fiscal

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const (
	CertificateMissingCode = "certificate_not_found"
	CertificateExpiredCode = "certificate_expired"

	CertificateMissingMessage     = "A empresa não tem certificado A1 ativo. Cadastre o certificado em Configurações → Empresas para transmitir a nota."
	CertificateNotYetValidMessage = "O certificado A1 da empresa ainda não está válido. Verifique a data de início em Configurações → Empresas."
	CertificateExpiredMessage     = "O certificado A1 da empresa está vencido. Envie um certificado válido em Configurações → Empresas."
)

// ClassifyCertificateWindow decides whether an active certificate can sign now.
// An empty code means the window is open.
func ClassifyCertificateWindow(notBefore, notAfter, now time.Time) (code, message string) {
	if now.Before(notBefore) {
		return CertificateExpiredCode, CertificateNotYetValidMessage
	}
	if !now.Before(notAfter) {
		return CertificateExpiredCode, CertificateExpiredMessage
	}
	return "", ""
}

// CertificateBlock reports a problem that must stop transmission before the
// note is handed to the gateway. A database failure is returned as err; a
// missing or expired certificate returns a code and a message safe to show
// on the note, with a nil error.
func (s *Service) CertificateBlock(ctx context.Context, organizationID, companyID uuid.UUID) (code, message string, err error) {
	var notBefore, notAfter time.Time
	err = s.pool.QueryRow(ctx, `
		select not_before, not_after
		from organization_company_certificates
		where organization_id = $1 and organization_company_id = $2 and status = 'active'
		order by created_at desc
		limit 1
	`, organizationID, companyID).Scan(&notBefore, &notAfter)
	if errors.Is(err, pgx.ErrNoRows) {
		return CertificateMissingCode, CertificateMissingMessage, nil
	}
	if err != nil {
		return "", "", err
	}
	code, message = ClassifyCertificateWindow(notBefore, notAfter, time.Now().UTC())
	return code, message, nil
}
