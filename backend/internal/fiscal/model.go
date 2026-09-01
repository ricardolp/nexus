package fiscal

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Document struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID uuid.UUID  `json:"organization_company_id"`
	DocumentType          string     `json:"document_type"`
	Direction             string     `json:"direction"`
	Environment           string     `json:"environment"`
	ExternalID            *string    `json:"external_id,omitempty"`
	SourceSystem          string     `json:"source_system"`
	SourceDocumentID      *string    `json:"source_document_id,omitempty"`
	IdempotencyKey        string     `json:"idempotency_key"`
	DocumentKey           *string    `json:"document_key,omitempty"`
	Status                string     `json:"status"`
	ProcessingStatus      string     `json:"processing_status"`
	CurrentVersion        int        `json:"current_version"`
	CorrelationID         uuid.UUID  `json:"correlation_id"`
	TraceID               uuid.UUID  `json:"trace_id"`
	ReceivedAt            time.Time  `json:"received_at"`
	CompletedAt           *time.Time `json:"completed_at,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

type DocumentEvent struct {
	ID                     uuid.UUID       `json:"id"`
	OrganizationID         uuid.UUID       `json:"organization_id"`
	OrganizationDocumentID uuid.UUID       `json:"organization_document_id"`
	EventType              string          `json:"event_type"`
	FromStatus             *string         `json:"from_status,omitempty"`
	ToStatus               *string         `json:"to_status,omitempty"`
	ActorType              string          `json:"actor_type"`
	ActorID                *string         `json:"actor_id,omitempty"`
	MetadataJSON           json.RawMessage `json:"metadata_json"`
	OccurredAt             time.Time       `json:"occurred_at"`
}

type RegisterManifestationInput struct {
	OrganizationID    uuid.UUID
	DocumentID        uuid.UUID
	ManifestationType string
	Notes             string
	ActorID           uuid.UUID
}

type RegisterDeliveryReceiptInput struct {
	OrganizationID uuid.UUID
	DocumentID     uuid.UUID
	ReceivedBy     string
	ReceivedAt     time.Time
	Notes          string
	ActorID        uuid.UUID
}

// EventListItem is a DocumentEvent joined with just enough document context
// (type, key, source) to render an organization-wide events feed without a
// second round trip per row.
type EventListItem struct {
	DocumentEvent
	DocumentType string  `json:"document_type"`
	Direction    string  `json:"direction"`
	DocumentKey  *string `json:"document_key,omitempty"`
	SourceSystem string  `json:"source_system"`
}

type ReceiveInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	DocumentType          string
	Direction             string
	Environment           string
	SourceSystem          string
	SourceDocumentID      string
	IdempotencyKey        string
	ExternalID            string
	DocumentKey           string
	Payload               []byte
	ContentType           string
	ActorType             string
	ActorID               string
	CorrelationID         uuid.UUID
	TraceID               uuid.UUID
	NFe                   *NFeExtension
	NFSe                  *NFSeExtension
}

type NFeExtension struct {
	AccessKey         string          `json:"access_key,omitempty"`
	Series            string          `json:"series,omitempty"`
	Number            string          `json:"number,omitempty"`
	Model             string          `json:"model,omitempty"`
	IssuerCNPJ        string          `json:"issuer_cnpj,omitempty"`
	RecipientDocument string          `json:"recipient_document,omitempty"`
	IssuedAt          *time.Time      `json:"issued_at,omitempty"`
	MetadataJSON      json.RawMessage `json:"metadata_json,omitempty"`
}

type NFSeExtension struct {
	MunicipalityCode string `json:"municipality_code,omitempty"`
	ProviderCode     string `json:"provider_code,omitempty"`
	RPSNumber        string `json:"rps_number,omitempty"`
	RPSSeries        string `json:"rps_series,omitempty"`
}

type ReceiveResult struct {
	Document *Document `json:"document"`
	Replayed bool      `json:"replayed"`
}

type NormalizedReceive struct {
	DocumentType string
	Direction    string
	ContentType  string
	ServiceCode  string
}
