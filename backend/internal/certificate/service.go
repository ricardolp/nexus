package certificate

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/keyvault"
)

type Service struct {
	pool  *db.Pool
	vault keyvault.CertificateStore
}

func NewService(pool *db.Pool, vault keyvault.CertificateStore) *Service {
	return &Service{pool: pool, vault: vault}
}

// UploadCertificate validates a PFX (.p12) A1 certificate locally, stores it
// in Key Vault (which becomes the sole holder of the private key from this
// point on) and records only its reference and display metadata. Any
// previously active certificate for the company is marked "replaced" in the
// same transaction, so exactly one certificate is ever active per company.
func (s *Service) UploadCertificate(ctx context.Context, in UploadCertificateInput) (*Certificate, error) {
	defer zeroBytes(in.PFX)

	cert, err := ParseA1Certificate(in.PFX, in.Password)
	if err != nil {
		return nil, err
	}

	var companyCNPJ, companyStatus string
	var companyUF *string
	if err := s.pool.QueryRow(ctx, `
		select cnpj, uf, status from organization_companies
		where id = $1 and organization_id = $2
	`, in.OrganizationCompanyID, in.OrganizationID).Scan(&companyCNPJ, &companyUF, &companyStatus); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("company_not_found", "Company not found")
		}
		return nil, err
	}
	if companyStatus != "active" {
		return nil, domainerr.Validation("company_not_active", "certificates can only be uploaded for an active company")
	}
	if companyUF == nil || *companyUF == "" {
		return nil, domainerr.Validation("company_uf_missing", "set the company's UF before uploading a certificate — SEFAZ routes by UF and the certificate's registered state must match it")
	}

	// CNPJ and UF both come from the certificate's own Subject fields —
	// never from anything the uploader claims — so a certificate for the
	// wrong company, or one whose registered state doesn't match what the
	// company was set up with, is rejected before it ever reaches the
	// vault. See validate.go for why CN/ST specifically (not the SAN
	// OtherName extension, which isn't reliably present).
	certCNPJ, cnpjOK := CertificateCNPJ(cert.Subject.CommonName)
	if !cnpjOK {
		return nil, domainerr.Validation("cnpj_unreadable", "could not read a CNPJ from the certificate — is this an e-CNPJ certificate?")
	}
	if certCNPJ != companyCNPJ {
		return nil, domainerr.Validation("cnpj_mismatch", "the certificate CNPJ does not match the company CNPJ")
	}
	certUF, ufOK := CertificateUF(cert.Subject.Province)
	if !ufOK {
		return nil, domainerr.Validation("uf_unreadable", "could not read a UF from the certificate's subject")
	}
	if certUF != *companyUF {
		return nil, domainerr.Validation("uf_mismatch", "the certificate's UF ("+certUF+") does not match the company's registered UF ("+*companyUF+")")
	}

	kvName := keyVaultCertificateName(in.OrganizationCompanyID)
	info, err := s.vault.ImportCertificate(ctx, kvName, in.PFX, in.Password)
	if err != nil {
		return nil, WrapStoreError(err)
	}

	now := time.Now().UTC()
	row := &Certificate{
		ID:                      ids.New(),
		OrganizationID:          in.OrganizationID,
		OrganizationCompanyID:   in.OrganizationCompanyID,
		Type:                    "A1",
		KeyVaultCertificateName: kvName,
		KeyVaultCertificateID:   info.CertificateID,
		Thumbprint:              info.Thumbprint,
		SerialNumber:            stringPtr(cert.SerialNumber.String()),
		NotBefore:               info.NotBefore,
		NotAfter:                info.NotAfter,
		Status:                  "active",
		UploadedByUserID:        in.ActorUserID,
		CreatedAt:               now,
		UpdatedAt:               now,
	}
	if cert.Subject.CommonName != "" {
		row.SubjectCN = stringPtr(cert.Subject.CommonName)
	}
	if cert.Issuer.CommonName != "" {
		row.IssuerCN = stringPtr(cert.Issuer.CommonName)
	}
	if row.Thumbprint == "" {
		row.Thumbprint = sha1Thumbprint(cert.Raw)
	}
	if row.NotBefore.IsZero() {
		row.NotBefore = cert.NotBefore.UTC()
	}
	if row.NotAfter.IsZero() {
		row.NotAfter = cert.NotAfter.UTC()
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update organization_company_certificates
			set status = 'replaced', updated_at = $1
			where organization_company_id = $2 and status = 'active'
		`, now, in.OrganizationCompanyID); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			insert into organization_company_certificates (
				id, organization_id, organization_company_id, type,
				key_vault_certificate_name, key_vault_certificate_id, thumbprint,
				subject_cn, issuer_cn, serial_number, not_before, not_after,
				status, uploaded_by_user_id, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		`,
			row.ID, row.OrganizationID, row.OrganizationCompanyID, row.Type,
			row.KeyVaultCertificateName, row.KeyVaultCertificateID, row.Thumbprint,
			row.SubjectCN, row.IssuerCN, row.SerialNumber, row.NotBefore, row.NotAfter,
			row.Status, row.UploadedByUserID, now, now,
		); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "certificate.upload",
			ResourceType:   "organization_company_certificates",
			ResourceID:     row.ID.String(),
			After: map[string]any{
				"organization_company_id": row.OrganizationCompanyID,
				"type":                    row.Type,
				"thumbprint":              row.Thumbprint,
				"not_before":              row.NotBefore,
				"not_after":               row.NotAfter,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return row, nil
}

func (s *Service) ListCertificates(ctx context.Context, organizationID, companyID uuid.UUID) ([]Certificate, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, type, key_vault_certificate_name,
		       thumbprint, subject_cn, issuer_cn, serial_number, not_before, not_after,
		       status, uploaded_by_user_id, created_at, updated_at
		from organization_company_certificates
		where organization_id = $1 and organization_company_id = $2
		order by created_at desc
	`, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Certificate
	for rows.Next() {
		var c Certificate
		if err := rows.Scan(
			&c.ID, &c.OrganizationID, &c.OrganizationCompanyID, &c.Type, &c.KeyVaultCertificateName,
			&c.Thumbprint, &c.SubjectCN, &c.IssuerCN, &c.SerialNumber, &c.NotBefore, &c.NotAfter,
			&c.Status, &c.UploadedByUserID, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *Service) GetActiveCertificate(ctx context.Context, organizationID, companyID uuid.UUID) (*Certificate, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, organization_company_id, type, key_vault_certificate_name,
		       thumbprint, subject_cn, issuer_cn, serial_number, not_before, not_after,
		       status, uploaded_by_user_id, created_at, updated_at
		from organization_company_certificates
		where organization_id = $1 and organization_company_id = $2 and status = 'active'
	`, organizationID, companyID)
	var c Certificate
	if err := row.Scan(
		&c.ID, &c.OrganizationID, &c.OrganizationCompanyID, &c.Type, &c.KeyVaultCertificateName,
		&c.Thumbprint, &c.SubjectCN, &c.IssuerCN, &c.SerialNumber, &c.NotBefore, &c.NotAfter,
		&c.Status, &c.UploadedByUserID, &c.CreatedAt, &c.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("certificate_not_found", "Company has no active certificate")
		}
		return nil, err
	}
	return &c, nil
}

// ExportSigningMaterial hands back the active certificate's raw PFX for a
// caller that needs to actually sign something with it — today only the
// internal-only `/internal/v1/companies/{id}/certificates/signing-material`
// endpoint calls this, on behalf of the nfe-gateway service (see
// docs/architecture/22_nfe_gateway_service.md). Every call is audited:
// this is the one place the private key of a tenant's certificate leaves
// this process, so every access must be attributable.
func (s *Service) ExportSigningMaterial(ctx context.Context, organizationID, companyID uuid.UUID) ([]byte, *Certificate, error) {
	cert, err := s.GetActiveCertificate(ctx, organizationID, companyID)
	if err != nil {
		return nil, nil, err
	}

	pfx, err := s.vault.ExportCertificate(ctx, cert.KeyVaultCertificateName)
	if err != nil {
		return nil, nil, WrapStoreError(err)
	}

	auditErr := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "service",
			ActorID:        "nfe_gateway",
			Action:         "certificate.signing_material_accessed",
			ResourceType:   "organization_company_certificates",
			ResourceID:     cert.ID.String(),
			After:          map[string]any{"organization_company_id": companyID, "thumbprint": cert.Thumbprint},
		})
	})
	if auditErr != nil {
		zeroBytes(pfx)
		return nil, nil, auditErr
	}

	return pfx, cert, nil
}

// RevokeCertificate disables the certificate in Key Vault so it can no
// longer be retrieved for signing, and marks it revoked in the database.
// Only the currently active certificate can be revoked — history rows
// (already replaced or revoked) are left untouched.
func (s *Service) RevokeCertificate(ctx context.Context, in RevokeCertificateInput) (*Certificate, error) {
	var kvName, status string
	if err := s.pool.QueryRow(ctx, `
		select key_vault_certificate_name, status from organization_company_certificates
		where id = $1 and organization_id = $2 and organization_company_id = $3
	`, in.CertificateID, in.OrganizationID, in.OrganizationCompanyID).Scan(&kvName, &status); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("certificate_not_found", "Certificate not found")
		}
		return nil, err
	}
	if status != "active" {
		return nil, domainerr.Conflict("certificate_not_active", "only the active certificate can be revoked")
	}

	if err := s.vault.DisableCertificate(ctx, kvName); err != nil {
		return nil, WrapStoreError(err)
	}

	var row Certificate
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		now := time.Now().UTC()
		r := tx.QueryRow(ctx, `
			update organization_company_certificates
			set status = 'revoked', updated_at = $1
			where id = $2
			returning id, organization_id, organization_company_id, type, key_vault_certificate_name,
			          thumbprint, subject_cn, issuer_cn, serial_number, not_before, not_after,
			          status, uploaded_by_user_id, created_at, updated_at
		`, now, in.CertificateID)
		if err := r.Scan(
			&row.ID, &row.OrganizationID, &row.OrganizationCompanyID, &row.Type, &row.KeyVaultCertificateName,
			&row.Thumbprint, &row.SubjectCN, &row.IssuerCN, &row.SerialNumber, &row.NotBefore, &row.NotAfter,
			&row.Status, &row.UploadedByUserID, &row.CreatedAt, &row.UpdatedAt,
		); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "certificate.revoke",
			ResourceType:   "organization_company_certificates",
			ResourceID:     in.CertificateID.String(),
			After:          map[string]any{"organization_company_id": in.OrganizationCompanyID, "status": "revoked"},
		})
	})
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func keyVaultCertificateName(companyID uuid.UUID) string {
	return "cert-" + strings.ReplaceAll(companyID.String(), "-", "")
}

func stringPtr(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func zeroBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// sha1Thumbprint is only used when Key Vault's response omits the
// thumbprint (not expected in practice, but the field is a pointer in the
// SDK) — it computes the same SHA-1 fingerprint over the DER certificate
// that Key Vault itself reports.
func sha1Thumbprint(der []byte) string {
	sum := sha1.Sum(der)
	return strings.ToUpper(hex.EncodeToString(sum[:]))
}
