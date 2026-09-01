package ops

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// RequestTrace is a searchable row from request_traces (inbound fiscal today).
type RequestTrace struct {
	ID               uuid.UUID       `json:"id"`
	OrganizationID   *uuid.UUID      `json:"organization_id,omitempty"`
	CorrelationID    uuid.UUID       `json:"correlation_id"`
	TraceID          uuid.UUID       `json:"trace_id"`
	SpanName         string          `json:"span_name"`
	ActorType        *string         `json:"actor_type,omitempty"`
	ActorID          *string         `json:"actor_id,omitempty"`
	HTTPMethod       *string         `json:"http_method,omitempty"`
	HTTPPath         *string         `json:"http_path,omitempty"`
	HTTPStatus       *int            `json:"http_status,omitempty"`
	DurationMs       *int            `json:"duration_ms,omitempty"`
	RequestHash      *string         `json:"request_hash,omitempty"`
	StorageObjectKey *string         `json:"storage_object_key,omitempty"`
	MetadataJSON     json.RawMessage `json:"metadata_json"`
	StartedAt        time.Time       `json:"started_at"`
	FinishedAt       *time.Time      `json:"finished_at,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
}

// PlatformError is a unified error row from attempts, inbound steps, or NF-e polls.
type PlatformError struct {
	ID               string     `json:"id"`
	Source           string     `json:"source"` // document_attempt | inbound_step | nfe_distribution_poll
	OrganizationID   uuid.UUID  `json:"organization_id"`
	CompanyID        *uuid.UUID `json:"company_id,omitempty"`
	DocumentID       *uuid.UUID `json:"document_id,omitempty"`
	ErrorCode        string     `json:"error_code"`
	ErrorMessage     string     `json:"error_message"`
	IsRetryable      *bool      `json:"is_retryable,omitempty"`
	OccurredAt       time.Time  `json:"occurred_at"`
}

// CompanyUsage is per-CNPJ operational rollup for a tenant.
type CompanyUsage struct {
	CompanyID            uuid.UUID  `json:"company_id"`
	LegalName            string     `json:"legal_name"`
	CNPJ                 string     `json:"cnpj"`
	Status               string     `json:"status"`
	DocumentsCount       int64      `json:"documents_count"`
	DocumentsLast24h     int64      `json:"documents_last_24h"`
	LastDocumentAt       *time.Time `json:"last_document_at,omitempty"`
	DistributionStatus   *string    `json:"distribution_status,omitempty"`
	DistributionLastPoll *time.Time `json:"distribution_last_poll_at,omitempty"`
	DistributionMessage  *string    `json:"distribution_last_message,omitempty"`
	NSUBacklog           *int64     `json:"nsu_backlog,omitempty"`
}

// DistributionStatusBucket counts companies by distribution state status.
type DistributionStatusBucket struct {
	Active  int64 `json:"active"`
	Paused  int64 `json:"paused"`
	Error   int64 `json:"error"`
	Unknown int64 `json:"unknown"`
}

// DistributionErrorCompany is a short row for companies currently in error.
type DistributionErrorCompany struct {
	OrganizationID uuid.UUID `json:"organization_id"`
	OrgLegalName   string    `json:"organization_legal_name"`
	CompanyID      uuid.UUID `json:"company_id"`
	CompanyName    string    `json:"company_legal_name"`
	CNPJ           string    `json:"cnpj"`
	LastMessage    *string   `json:"last_message,omitempty"`
}

// PlatformStatus is the aggregated health snapshot for the admin status page.
type PlatformStatus struct {
	ControlPlane          string                     `json:"control_plane"`
	OrganizationsActive   int64                      `json:"organizations_active"`
	OrganizationsSuspended int64                     `json:"organizations_suspended"`
	DocumentsLast24h      int64                      `json:"documents_last_24h"`
	ErrorsLast24h         int64                      `json:"errors_last_24h"`
	Distribution          DistributionStatusBucket   `json:"distribution"`
	DistributionErrors    []DistributionErrorCompany `json:"distribution_errors"`
	OutboxPending         int64                      `json:"outbox_pending"`
	OutboxFailed          int64                      `json:"outbox_failed"`
	GeneratedAt           time.Time                  `json:"generated_at"`
}

// ListTracesInput filters request_traces listings.
type ListTracesInput struct {
	OrganizationID *uuid.UUID
	HTTPStatus     *int
	SpanName       string
	Since          *time.Time
	Until          *time.Time
	Before         *time.Time
	Limit          int
}

// ListErrorsInput filters the unified error feed.
type ListErrorsInput struct {
	OrganizationID *uuid.UUID
	Source         string
	Before         *time.Time
	Limit          int
}
