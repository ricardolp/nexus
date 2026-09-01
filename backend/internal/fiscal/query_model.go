package fiscal

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	QueryTypeNSU   = "nsu"
	QueryTypeChave = "chave"
	QueryTypeBatch = "batch"

	QueryStatusPending    = "pending"
	QueryStatusProcessing = "processing"
	QueryStatusCompleted  = "completed"
	QueryStatusFailed     = "failed"

	QueryItemStatusPending  = "pending"
	QueryItemStatusFound    = "found"
	QueryItemStatusNotFound = "not_found"
	QueryItemStatusError    = "error"

	// MaxBatchChaves caps how many chaves a single request can hold — SEFAZ's
	// real limit is 20 consultas/hora per CNPJ (see distribution_state.py on
	// the nfe-gateway side), so a bigger batch just means it resumes over
	// several rate-limit windows; this cap exists so one request doesn't
	// silently take days without the user being told to split it up.
	MaxBatchChaves = 100

	chaveLength = 44
)

// QueryRequest is an on-demand SEFAZ query (por NSU, por chave avulsa, ou em
// lote) triggered by a user from the fiscal documents listing — distinct
// from the automatic background distribution poller. It shares the same
// per-company SEFAZ rate-limit window as that poller; see
// docs/architecture/22_nfe_gateway_service.md.
type QueryRequest struct {
	ID                    uuid.UUID       `json:"id"`
	OrganizationID        uuid.UUID       `json:"organization_id"`
	OrganizationCompanyID uuid.UUID       `json:"organization_company_id"`
	RequestedByUserID     uuid.UUID       `json:"requested_by_user_id"`
	QueryType             string          `json:"query_type"`
	ParamsJSON            json.RawMessage `json:"params_json"`
	Status                string          `json:"status"`
	ResultSummaryJSON     json.RawMessage `json:"result_summary_json,omitempty"`
	CreatedAt             time.Time       `json:"created_at"`
	CompletedAt           *time.Time      `json:"completed_at,omitempty"`
	AlreadyQueued         bool            `json:"already_queued,omitempty"`
}

type QueryItem struct {
	ID             uuid.UUID  `json:"id"`
	QueryRequestID uuid.UUID  `json:"query_request_id"`
	Chave          string     `json:"chave"`
	Status         string     `json:"status"`
	DocumentID     *uuid.UUID `json:"document_id,omitempty"`
	ErrorMessage   *string    `json:"error_message,omitempty"`
	ResolvedAt     *time.Time `json:"resolved_at,omitempty"`
}

type QueryRequestWithItems struct {
	QueryRequest
	Items []QueryItem `json:"items,omitempty"`
}

type CreateQueryInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	RequestedByUserID     uuid.UUID
	QueryType             string
	NSU                   *int64
	Chaves                []string
}

type queryParamsNSU struct {
	NSU int64 `json:"nsu"`
}

type queryParamsChaves struct {
	Chaves []string `json:"chaves"`
}
