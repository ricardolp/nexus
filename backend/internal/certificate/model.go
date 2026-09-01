package certificate

import (
	"time"

	"github.com/google/uuid"
)

// Certificate is a digital certificate (currently only ICP-Brasil A1)
// registered for a company and used to sign fiscal documents before they are
// sent to SEFAZ. The private key is never stored here — it lives in Azure
// Key Vault, and KeyVaultCertificateID is only the versioned pointer used to
// retrieve it for signing, so it is deliberately left out of the JSON
// representation returned by the API.
type Certificate struct {
	ID                      uuid.UUID `json:"id"`
	OrganizationID          uuid.UUID `json:"organization_id"`
	OrganizationCompanyID   uuid.UUID `json:"organization_company_id"`
	Type                    string    `json:"type"`
	KeyVaultCertificateName string    `json:"key_vault_certificate_name"`
	KeyVaultCertificateID   string    `json:"-"`
	Thumbprint              string    `json:"thumbprint"`
	SubjectCN               *string   `json:"subject_cn,omitempty"`
	IssuerCN                *string   `json:"issuer_cn,omitempty"`
	SerialNumber            *string   `json:"serial_number,omitempty"`
	NotBefore               time.Time `json:"not_before"`
	NotAfter                time.Time `json:"not_after"`
	Status                  string    `json:"status"`
	UploadedByUserID        uuid.UUID `json:"uploaded_by_user_id"`
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

type UploadCertificateInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	PFX                   []byte
	Password              string
	ActorUserID           uuid.UUID
}

type RevokeCertificateInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	CertificateID         uuid.UUID
	ActorUserID           uuid.UUID
}
