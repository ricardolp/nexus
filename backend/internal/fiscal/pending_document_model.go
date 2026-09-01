package fiscal

import (
	"time"

	"github.com/google/uuid"
)

const (
	PendingDocumentStatusPending     = "pending"
	PendingDocumentStatusManifesting = "manifesting"
	PendingDocumentStatusManifested  = "manifested"
	PendingDocumentStatusError       = "error"

	ManifestationRequestStatusPending    = "pending"
	ManifestationRequestStatusProcessing = "processing"
	ManifestationRequestStatusCompleted  = "completed"
	ManifestationRequestStatusFailed     = "failed"
)

// PendingDocument mirrors nfe_pending_manifestation_documents — a resNFe/
// resEvento/procEventoNFe summary the nfe-gateway found via NSU/chave
// distribution but couldn't ingest as a full document (no <infNFe>, see
// nfe-gateway/src/nfe_gateway/sefaz/distribution.py's parse_pending_summary
// docstring). Owned by nfe-gateway — Go only reads this table.
type PendingDocument struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID uuid.UUID  `json:"organization_company_id"`
	Chave                 string     `json:"chave"`
	NSU                   int64      `json:"nsu"`
	Schema                string     `json:"schema"`
	CNPJEmitente          *string    `json:"cnpj_emitente,omitempty"`
	NomeEmitente          *string    `json:"nome_emitente,omitempty"`
	Valor                 *float64   `json:"valor,omitempty"`
	DataEmissao           *time.Time `json:"data_emissao,omitempty"`
	Protocolo             *string    `json:"protocolo,omitempty"`
	Situacao              *string    `json:"situacao,omitempty"`
	Status                string     `json:"status"`
	ErrorMessage          *string    `json:"error_message,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	ManifestedAt          *time.Time `json:"manifested_at,omitempty"`
}

// ManifestationRequest mirrors nfe_manifestation_requests — a deliberate,
// user-triggered "send Ciência da Operação for this pending document" ask.
// Owned by Go (this is the write side); nfe-gateway claims 'pending' rows
// and updates status when done, same split as QueryRequest/query_worker.py.
type ManifestationRequest struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID uuid.UUID  `json:"organization_company_id"`
	PendingDocumentID     uuid.UUID  `json:"pending_document_id"`
	RequestedByUserID     uuid.UUID  `json:"requested_by_user_id"`
	Status                string     `json:"status"`
	ErrorMessage          *string    `json:"error_message,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
}
