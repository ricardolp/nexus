package integrationlog

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// Log is the tenant-facing shape of an integration request log row.
type Log struct {
	ID                  uuid.UUID       `json:"id"`
	OrganizationID      *uuid.UUID      `json:"organization_id,omitempty"`
	CorrelationID       uuid.UUID       `json:"correlation_id"`
	TraceID             uuid.UUID       `json:"trace_id"`
	SpanName            string          `json:"span_name"`
	ActorType           *string         `json:"actor_type,omitempty"`
	ActorID             *string         `json:"actor_id,omitempty"`
	Direction           *string         `json:"direction,omitempty"`
	Origin              *string         `json:"origin,omitempty"`
	Destination         *string         `json:"destination,omitempty"`
	Level               *string         `json:"level,omitempty"`
	Summary             *string         `json:"summary,omitempty"`
	HTTPMethod          *string         `json:"http_method,omitempty"`
	HTTPPath            *string         `json:"http_path,omitempty"`
	HTTPStatus          *int            `json:"http_status,omitempty"`
	DurationMs          *int            `json:"duration_ms,omitempty"`
	RequestHash         *string         `json:"request_hash,omitempty"`
	StorageObjectKey    *string         `json:"storage_object_key,omitempty"`
	RequestHeadersJSON  json.RawMessage `json:"request_headers_json"`
	ResponseHeadersJSON json.RawMessage `json:"response_headers_json"`
	RequestBodyPreview  *string         `json:"request_body_preview,omitempty"`
	ResponseBodyPreview *string         `json:"response_body_preview,omitempty"`
	RequestPayloadKey   *string         `json:"request_payload_key,omitempty"`
	ResponsePayloadKey  *string         `json:"response_payload_key,omitempty"`
	MetadataJSON        json.RawMessage `json:"metadata_json"`
	StartedAt           time.Time       `json:"started_at"`
	FinishedAt          *time.Time      `json:"finished_at,omitempty"`
	CreatedAt           time.Time       `json:"created_at"`
}

// ListInput filters paginated org logs.
type ListInput struct {
	OrganizationID uuid.UUID
	Level          string
	Direction      string
	Query          string
	Page           int
	Limit          int
}

// ListResult is a page of logs plus totals.
type ListResult struct {
	Items      []Log `json:"items"`
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	Total      int64 `json:"total"`
	ErrorCount int64 `json:"error_count"`
}

// Service queries integration logs for the tenant API.
type Service struct {
	pool *db.Pool
}

func NewService(pool *db.Pool) *Service {
	return &Service{pool: pool}
}

func clampPageLimit(page, limit int) (int, int) {
	if page < 1 {
		page = 1
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit
}

func (s *Service) List(ctx context.Context, in ListInput) (*ListResult, error) {
	page, limit := clampPageLimit(in.Page, in.Limit)
	args := []any{in.OrganizationID}
	where := []string{"organization_id = $1"}
	argN := 2

	if level := strings.TrimSpace(strings.ToLower(in.Level)); level != "" && level != "all" {
		where = append(where, fmt.Sprintf("level = $%d", argN))
		args = append(args, level)
		argN++
	}
	if dir := strings.TrimSpace(strings.ToLower(in.Direction)); dir != "" {
		where = append(where, fmt.Sprintf("direction = $%d", argN))
		args = append(args, dir)
		argN++
	}
	if q := strings.TrimSpace(in.Query); q != "" {
		where = append(where, fmt.Sprintf(`(
			coalesce(summary,'') ilike $%d or
			coalesce(http_path,'') ilike $%d or
			coalesce(origin,'') ilike $%d or
			coalesce(destination,'') ilike $%d or
			coalesce(span_name,'') ilike $%d
		)`, argN, argN, argN, argN, argN))
		args = append(args, "%"+q+"%")
		argN++
	}

	whereSQL := strings.Join(where, " and ")

	var total, errorCount int64
	if err := s.pool.QueryRow(ctx, `
		select count(*), count(*) filter (where level = 'error')
		from request_traces
		where `+whereSQL, args...).Scan(&total, &errorCount); err != nil {
		return nil, err
	}

	offset := (page - 1) * limit
	args = append(args, limit, offset)
	rows, err := s.pool.Query(ctx, `
		select `+logSelectColumns+`
		from request_traces
		where `+whereSQL+`
		order by started_at desc
		limit $`+fmt.Sprint(argN)+` offset $`+fmt.Sprint(argN+1), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]Log, 0)
	for rows.Next() {
		item, err := scanLog(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &ListResult{
		Items:      items,
		Page:       page,
		Limit:      limit,
		Total:      total,
		ErrorCount: errorCount,
	}, nil
}

func (s *Service) Get(ctx context.Context, organizationID, id uuid.UUID) (*Log, error) {
	row := s.pool.QueryRow(ctx, `
		select `+logSelectColumns+`
		from request_traces
		where id = $1 and organization_id = $2
	`, id, organizationID)
	item, err := scanLog(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("integration_log_not_found", "Integration log not found")
		}
		return nil, err
	}
	return &item, nil
}

const logSelectColumns = `
	id, organization_id, correlation_id, trace_id, span_name, actor_type, actor_id,
	http_method, http_path, http_status, duration_ms, request_hash, storage_object_key,
	metadata_json, started_at, finished_at, created_at,
	direction, origin, destination, level, summary,
	request_headers_json, response_headers_json,
	request_body_preview, response_body_preview,
	request_payload_key, response_payload_key
`

type scannable interface {
	Scan(dest ...any) error
}

func scanLog(row scannable) (Log, error) {
	var t Log
	var meta, reqH, respH []byte
	err := row.Scan(
		&t.ID, &t.OrganizationID, &t.CorrelationID, &t.TraceID, &t.SpanName,
		&t.ActorType, &t.ActorID, &t.HTTPMethod, &t.HTTPPath, &t.HTTPStatus,
		&t.DurationMs, &t.RequestHash, &t.StorageObjectKey, &meta,
		&t.StartedAt, &t.FinishedAt, &t.CreatedAt,
		&t.Direction, &t.Origin, &t.Destination, &t.Level, &t.Summary,
		&reqH, &respH,
		&t.RequestBodyPreview, &t.ResponseBodyPreview,
		&t.RequestPayloadKey, &t.ResponsePayloadKey,
	)
	if err != nil {
		return Log{}, err
	}
	if len(meta) == 0 {
		t.MetadataJSON = json.RawMessage(`{}`)
	} else {
		t.MetadataJSON = meta
	}
	if len(reqH) == 0 {
		t.RequestHeadersJSON = json.RawMessage(`{}`)
	} else {
		t.RequestHeadersJSON = reqH
	}
	if len(respH) == 0 {
		t.ResponseHeadersJSON = json.RawMessage(`{}`)
	} else {
		t.ResponseHeadersJSON = respH
	}
	return t, nil
}
