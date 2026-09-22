package integrationlog

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// Entry is one integration HTTP exchange to persist in request_traces.
type Entry struct {
	OrganizationID *uuid.UUID
	CorrelationID  uuid.UUID
	TraceID        uuid.UUID
	SpanName       string
	ActorType      string
	ActorID        string
	Direction      string
	Origin         string
	Destination    string
	Level          string
	Summary        string
	HTTPMethod     string
	HTTPPath       string
	HTTPStatus     *int
	DurationMs     *int
	RequestHash    string
	StorageKey     string
	RequestHeaders json.RawMessage
	ResponseHeaders json.RawMessage
	RequestBodyPreview  string
	ResponseBodyPreview string
	RequestPayloadKey   string
	ResponsePayloadKey  string
	Metadata            json.RawMessage
	StartedAt           time.Time
	FinishedAt          *time.Time
}

// Recorder persists integration log entries without failing the caller.
type Recorder struct {
	pool   *db.Pool
	logger *slog.Logger
}

func NewRecorder(pool *db.Pool, logger *slog.Logger) *Recorder {
	if logger == nil {
		logger = slog.Default()
	}
	return &Recorder{pool: pool, logger: logger}
}

// Record inserts a request_traces row. Errors are logged and swallowed.
func (r *Recorder) Record(ctx context.Context, e Entry) {
	if r == nil || r.pool == nil {
		return
	}
	if err := r.record(ctx, e); err != nil {
		r.logger.Warn("integration_log_record_failed", "error", err, "span", e.SpanName)
	}
}

func (r *Recorder) record(ctx context.Context, e Entry) error {
	id := ids.New()
	now := time.Now().UTC()
	started := e.StartedAt
	if started.IsZero() {
		started = now
	}
	finished := e.FinishedAt
	if finished == nil {
		t := now
		finished = &t
	}
	if e.CorrelationID == uuid.Nil {
		e.CorrelationID = ids.New()
	}
	if e.TraceID == uuid.Nil {
		e.TraceID = ids.New()
	}
	span := stringsOr(e.SpanName, "integration.http")
	direction := stringsOr(e.Direction, DirectionInbound)
	level := stringsOr(e.Level, LevelInfo)
	summary := stringsOr(e.Summary, span)
	meta := e.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	reqHeaders := e.RequestHeaders
	if len(reqHeaders) == 0 {
		reqHeaders = json.RawMessage(`{}`)
	}
	respHeaders := e.ResponseHeaders
	if len(respHeaders) == 0 {
		respHeaders = json.RawMessage(`{}`)
	}

	var org any
	if e.OrganizationID != nil && *e.OrganizationID != uuid.Nil {
		org = *e.OrganizationID
	}
	var actorType, actorID any
	if e.ActorType != "" {
		actorType = e.ActorType
	}
	if e.ActorID != "" {
		actorID = e.ActorID
	}
	var method, path any
	if e.HTTPMethod != "" {
		method = e.HTTPMethod
	}
	if e.HTTPPath != "" {
		path = e.HTTPPath
	}
	var status, duration any
	if e.HTTPStatus != nil {
		status = *e.HTTPStatus
	}
	if e.DurationMs != nil {
		duration = *e.DurationMs
	}
	var reqHash, storageKey any
	if e.RequestHash != "" {
		reqHash = e.RequestHash
	}
	if e.StorageKey != "" {
		storageKey = e.StorageKey
	}
	var reqPreview, respPreview, reqKey, respKey, origin, dest any
	if e.RequestBodyPreview != "" {
		reqPreview = e.RequestBodyPreview
	}
	if e.ResponseBodyPreview != "" {
		respPreview = e.ResponseBodyPreview
	}
	if e.RequestPayloadKey != "" {
		reqKey = e.RequestPayloadKey
	}
	if e.ResponsePayloadKey != "" {
		respKey = e.ResponsePayloadKey
	}
	if e.Origin != "" {
		origin = e.Origin
	}
	if e.Destination != "" {
		dest = e.Destination
	}

	_, err := r.pool.Exec(ctx, `
		insert into request_traces (
			id, organization_id, correlation_id, trace_id, span_name, actor_type, actor_id,
			http_method, http_path, http_status, duration_ms, request_hash, storage_object_key,
			metadata_json, started_at, finished_at, created_at,
			direction, origin, destination, level, summary,
			request_headers_json, response_headers_json,
			request_body_preview, response_body_preview,
			request_payload_key, response_payload_key
		) values (
			$1,$2,$3,$4,$5,$6,$7,
			$8,$9,$10,$11,$12,$13,
			$14,$15,$16,$17,
			$18,$19,$20,$21,$22,
			$23,$24,
			$25,$26,
			$27,$28
		)
	`, id, org, e.CorrelationID, e.TraceID, span, actorType, actorID,
		method, path, status, duration, reqHash, storageKey,
		meta, started, finished, now,
		direction, origin, dest, level, summary,
		reqHeaders, respHeaders,
		reqPreview, respPreview,
		reqKey, respKey,
	)
	return err
}

func stringsOr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
