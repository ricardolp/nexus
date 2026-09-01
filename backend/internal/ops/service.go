package ops

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

type Service struct {
	pool *db.Pool
}

func NewService(pool *db.Pool) *Service {
	return &Service{pool: pool}
}

func clampLimit(limit int) int {
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func (s *Service) ListRequestTraces(ctx context.Context, in ListTracesInput) ([]RequestTrace, *time.Time, error) {
	limit := clampLimit(in.Limit)
	args := []any{}
	where := []string{"1=1"}
	argN := 1

	if in.OrganizationID != nil {
		where = append(where, fmt.Sprintf("organization_id = $%d", argN))
		args = append(args, *in.OrganizationID)
		argN++
	}
	if in.HTTPStatus != nil {
		where = append(where, fmt.Sprintf("http_status = $%d", argN))
		args = append(args, *in.HTTPStatus)
		argN++
	}
	if span := strings.TrimSpace(in.SpanName); span != "" {
		where = append(where, fmt.Sprintf("span_name = $%d", argN))
		args = append(args, span)
		argN++
	}
	if in.Since != nil {
		where = append(where, fmt.Sprintf("started_at >= $%d", argN))
		args = append(args, *in.Since)
		argN++
	}
	if in.Until != nil {
		where = append(where, fmt.Sprintf("started_at <= $%d", argN))
		args = append(args, *in.Until)
		argN++
	}
	if in.Before != nil {
		where = append(where, fmt.Sprintf("started_at < $%d", argN))
		args = append(args, *in.Before)
		argN++
	}

	args = append(args, limit+1)
	query := fmt.Sprintf(`
		select id, organization_id, correlation_id, trace_id, span_name, actor_type, actor_id,
		       http_method, http_path, http_status, duration_ms, request_hash, storage_object_key,
		       metadata_json, started_at, finished_at, created_at
		from request_traces
		where %s
		order by started_at desc
		limit $%d
	`, strings.Join(where, " and "), argN)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	items := make([]RequestTrace, 0)
	for rows.Next() {
		var t RequestTrace
		var meta []byte
		if err := rows.Scan(
			&t.ID, &t.OrganizationID, &t.CorrelationID, &t.TraceID, &t.SpanName,
			&t.ActorType, &t.ActorID, &t.HTTPMethod, &t.HTTPPath, &t.HTTPStatus,
			&t.DurationMs, &t.RequestHash, &t.StorageObjectKey, &meta,
			&t.StartedAt, &t.FinishedAt, &t.CreatedAt,
		); err != nil {
			return nil, nil, err
		}
		if len(meta) == 0 {
			t.MetadataJSON = json.RawMessage(`{}`)
		} else {
			t.MetadataJSON = meta
		}
		items = append(items, t)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	var nextBefore *time.Time
	if len(items) > limit {
		t := items[limit-1].StartedAt
		nextBefore = &t
		items = items[:limit]
	}
	return items, nextBefore, nil
}

func (s *Service) GetRequestTrace(ctx context.Context, id uuid.UUID) (*RequestTrace, error) {
	var t RequestTrace
	var meta []byte
	err := s.pool.QueryRow(ctx, `
		select id, organization_id, correlation_id, trace_id, span_name, actor_type, actor_id,
		       http_method, http_path, http_status, duration_ms, request_hash, storage_object_key,
		       metadata_json, started_at, finished_at, created_at
		from request_traces
		where id = $1
	`, id).Scan(
		&t.ID, &t.OrganizationID, &t.CorrelationID, &t.TraceID, &t.SpanName,
		&t.ActorType, &t.ActorID, &t.HTTPMethod, &t.HTTPPath, &t.HTTPStatus,
		&t.DurationMs, &t.RequestHash, &t.StorageObjectKey, &meta,
		&t.StartedAt, &t.FinishedAt, &t.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("request_trace_not_found", "Request trace not found")
		}
		return nil, err
	}
	if len(meta) == 0 {
		t.MetadataJSON = json.RawMessage(`{}`)
	} else {
		t.MetadataJSON = meta
	}
	return &t, nil
}

func (s *Service) ListPlatformErrors(ctx context.Context, in ListErrorsInput) ([]PlatformError, *time.Time, error) {
	limit := clampLimit(in.Limit)
	source := strings.TrimSpace(in.Source)

	parts := make([]string, 0, 3)
	args := []any{}
	argN := 1

	addOrgFilter := func(col string) string {
		if in.OrganizationID == nil {
			return "true"
		}
		clause := fmt.Sprintf("%s = $%d", col, argN)
		args = append(args, *in.OrganizationID)
		argN++
		return clause
	}

	if source == "" || source == "document_attempt" {
		orgClause := addOrgFilter("a.organization_id")
		parts = append(parts, fmt.Sprintf(`
			select a.id::text as id,
			       'document_attempt' as source,
			       a.organization_id,
			       d.organization_company_id as company_id,
			       a.organization_document_id as document_id,
			       coalesce(a.error_code, 'unknown') as error_code,
			       coalesce(a.error_message_sanitized, '') as error_message,
			       null::boolean as is_retryable,
			       a.created_at as occurred_at
			from organization_document_attempts a
			left join organization_documents d on d.id = a.organization_document_id
			where a.error_code is not null and %s
		`, orgClause))
	}

	if source == "" || source == "inbound_step" {
		orgClause := addOrgFilter("s.organization_id")
		parts = append(parts, fmt.Sprintf(`
			select s.id::text as id,
			       'inbound_step' as source,
			       s.organization_id,
			       d.organization_company_id as company_id,
			       s.organization_document_id as document_id,
			       coalesce(s.error_code, 'unknown') as error_code,
			       coalesce(s.error_message_sanitized, '') as error_message,
			       null::boolean as is_retryable,
			       coalesce(s.finished_at, s.updated_at) as occurred_at
			from organization_execution_plan_steps s
			left join organization_documents d on d.id = s.organization_document_id
			where s.error_code is not null and %s
		`, orgClause))
	}

	if source == "" || source == "nfe_distribution_poll" {
		orgClause := addOrgFilter("p.organization_id")
		parts = append(parts, fmt.Sprintf(`
			select p.id::text as id,
			       'nfe_distribution_poll' as source,
			       p.organization_id,
			       p.organization_company_id as company_id,
			       null::uuid as document_id,
			       coalesce(p.cstat, 'poll_error') as error_code,
			       coalesce(p.error_message, '') as error_message,
			       null::boolean as is_retryable,
			       p.created_at as occurred_at
			from organization_company_nfe_distribution_polls p
			where p.outcome = 'error' and %s
		`, orgClause))
	}

	if len(parts) == 0 {
		return []PlatformError{}, nil, domainerr.Validation("invalid_source", "source must be document_attempt, inbound_step, or nfe_distribution_poll")
	}

	union := strings.Join(parts, "\nunion all\n")
	beforeClause := "true"
	if in.Before != nil {
		beforeClause = fmt.Sprintf("occurred_at < $%d", argN)
		args = append(args, *in.Before)
		argN++
	}
	args = append(args, limit+1)

	query := fmt.Sprintf(`
		select id, source, organization_id, company_id, document_id, error_code, error_message, is_retryable, occurred_at
		from (%s) errors
		where %s
		order by occurred_at desc
		limit $%d
	`, union, beforeClause, argN)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	items := make([]PlatformError, 0)
	for rows.Next() {
		var e PlatformError
		if err := rows.Scan(
			&e.ID, &e.Source, &e.OrganizationID, &e.CompanyID, &e.DocumentID,
			&e.ErrorCode, &e.ErrorMessage, &e.IsRetryable, &e.OccurredAt,
		); err != nil {
			return nil, nil, err
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	var nextBefore *time.Time
	if len(items) > limit {
		t := items[limit-1].OccurredAt
		nextBefore = &t
		items = items[:limit]
	}
	return items, nextBefore, nil
}

func (s *Service) ListCompaniesUsage(ctx context.Context, organizationID uuid.UUID) ([]CompanyUsage, error) {
	rows, err := s.pool.Query(ctx, `
		select
			c.id, c.legal_name, c.cnpj, c.status,
			count(distinct d.id) as documents_count,
			count(distinct d.id) filter (where d.created_at >= now() - interval '24 hours') as documents_last_24h,
			max(d.created_at) as last_document_at,
			st.status as distribution_status,
			st.last_poll_at as distribution_last_poll_at,
			st.last_message as distribution_last_message,
			case when st.max_nsu is not null and st.last_nsu is not null
				then greatest(st.max_nsu - st.last_nsu, 0)
				else null end as nsu_backlog
		from organization_companies c
		left join organization_documents d on d.organization_company_id = c.id
		left join organization_company_nfe_distribution_state st on st.organization_company_id = c.id
		where c.organization_id = $1
		group by c.id, c.legal_name, c.cnpj, c.status, st.status, st.last_poll_at, st.last_message, st.max_nsu, st.last_nsu
		order by c.legal_name
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]CompanyUsage, 0)
	for rows.Next() {
		var u CompanyUsage
		if err := rows.Scan(
			&u.CompanyID, &u.LegalName, &u.CNPJ, &u.Status,
			&u.DocumentsCount, &u.DocumentsLast24h, &u.LastDocumentAt,
			&u.DistributionStatus, &u.DistributionLastPoll, &u.DistributionMessage, &u.NSUBacklog,
		); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Service) PlatformStatus(ctx context.Context) (*PlatformStatus, error) {
	status := &PlatformStatus{
		ControlPlane:       "ok",
		DistributionErrors: []DistributionErrorCompany{},
		GeneratedAt:        time.Now().UTC(),
	}

	if err := s.pool.QueryRow(ctx, `
		select
			count(*) filter (where status = 'active'),
			count(*) filter (where status = 'suspended')
		from organizations
	`).Scan(&status.OrganizationsActive, &status.OrganizationsSuspended); err != nil {
		return nil, err
	}

	if err := s.pool.QueryRow(ctx, `
		select count(*) from organization_documents
		where created_at >= now() - interval '24 hours'
	`).Scan(&status.DocumentsLast24h); err != nil {
		return nil, err
	}

	if err := s.pool.QueryRow(ctx, `
		select
			(select count(*) from organization_document_attempts
			 where error_code is not null and created_at >= now() - interval '24 hours')
			+
			(select count(*) from organization_execution_plan_steps
			 where error_code is not null and coalesce(finished_at, updated_at) >= now() - interval '24 hours')
			+
			(select count(*) from organization_company_nfe_distribution_polls
			 where outcome = 'error' and created_at >= now() - interval '24 hours')
	`).Scan(&status.ErrorsLast24h); err != nil {
		return nil, err
	}

	if err := s.pool.QueryRow(ctx, `
		select
			count(*) filter (where status = 'active'),
			count(*) filter (where status = 'paused'),
			count(*) filter (where status = 'error')
		from organization_company_nfe_distribution_state
	`).Scan(&status.Distribution.Active, &status.Distribution.Paused, &status.Distribution.Error); err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		select st.organization_id, o.legal_name, st.organization_company_id, c.legal_name, c.cnpj, st.last_message
		from organization_company_nfe_distribution_state st
		join organizations o on o.id = st.organization_id
		join organization_companies c on c.id = st.organization_company_id
		where st.status = 'error'
		order by st.updated_at desc
		limit 20
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var row DistributionErrorCompany
		if err := rows.Scan(
			&row.OrganizationID, &row.OrgLegalName, &row.CompanyID, &row.CompanyName, &row.CNPJ, &row.LastMessage,
		); err != nil {
			return nil, err
		}
		status.DistributionErrors = append(status.DistributionErrors, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := s.pool.QueryRow(ctx, `
		select
			count(*) filter (where status in ('pending', 'publishing')),
			count(*) filter (where status = 'failed')
		from outbox_events
	`).Scan(&status.OutboxPending, &status.OutboxFailed); err != nil {
		return nil, err
	}

	return status, nil
}
