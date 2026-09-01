package fiscal

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/broker"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// QueryService owns fiscal_document_query_requests/_items — the on-demand
// counterpart to the nfe-gateway's automatic distribution poller. It only
// creates the request and hands it off (DB row + a wake-up event); the
// nfe-gateway is the one that actually calls SEFAZ and writes the item-level
// results, the same split already used for outbound transmission (see
// MessagingProvider) and for the background poller's own state tables.
type QueryService struct {
	pool *db.Pool
	orgs *organization.Service
	bus  broker.Publisher
}

func NewQueryService(pool *db.Pool, orgs *organization.Service, bus broker.Publisher) *QueryService {
	return &QueryService{pool: pool, orgs: orgs, bus: bus}
}

func (s *QueryService) Create(ctx context.Context, in CreateQueryInput) (*QueryRequest, error) {
	if _, err := s.orgs.GetCompany(ctx, in.OrganizationID, in.OrganizationCompanyID); err != nil {
		return nil, err
	}

	var params json.RawMessage
	var chaves []string
	switch in.QueryType {
	case QueryTypeNSU:
		if in.NSU == nil || *in.NSU < 0 {
			return nil, domainerr.Validation("nsu_required", "nsu must be a non-negative number")
		}
		b, err := json.Marshal(queryParamsNSU{NSU: *in.NSU})
		if err != nil {
			return nil, err
		}
		params = b
	case QueryTypeChave:
		chave, err := normalizeChave(firstOrEmpty(in.Chaves))
		if err != nil {
			return nil, err
		}
		chaves = []string{chave}
		b, err := json.Marshal(queryParamsChaves{Chaves: chaves})
		if err != nil {
			return nil, err
		}
		params = b
	case QueryTypeBatch:
		normalized, err := normalizeChaves(in.Chaves)
		if err != nil {
			return nil, err
		}
		chaves = normalized
		b, err := json.Marshal(queryParamsChaves{Chaves: chaves})
		if err != nil {
			return nil, err
		}
		params = b
	default:
		return nil, domainerr.Validation("invalid_query_type", "query_type must be one of: nsu, chave, batch")
	}

	now := time.Now().UTC()
	req := &QueryRequest{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: in.OrganizationCompanyID,
		RequestedByUserID:     in.RequestedByUserID,
		QueryType:             in.QueryType,
		ParamsJSON:            params,
		Status:                QueryStatusPending,
		CreatedAt:             now,
	}

	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtext($1::text))`, in.OrganizationCompanyID.String()); err != nil {
			return err
		}

		if len(chaves) > 0 {
			inFlight, err := inFlightChaves(ctx, tx, in.OrganizationID, in.OrganizationCompanyID, chaves)
			if err != nil {
				return err
			}
			if in.QueryType == QueryTypeChave {
				if existingID, ok := inFlight[chaves[0]]; ok {
					existing, err := getQueryRequest(ctx, tx, in.OrganizationID, existingID)
					if err != nil {
						return err
					}
					existing.AlreadyQueued = true
					*req = *existing
					return nil
				}
			}
			if in.QueryType == QueryTypeBatch {
				remaining := make([]string, 0, len(chaves))
				for _, chave := range chaves {
					if _, ok := inFlight[chave]; !ok {
						remaining = append(remaining, chave)
					}
				}
				if len(remaining) == 0 {
					existing, err := getQueryRequest(ctx, tx, in.OrganizationID, inFlight[chaves[0]])
					if err != nil {
						return err
					}
					existing.AlreadyQueued = true
					*req = *existing
					return nil
				}
				if len(remaining) != len(chaves) {
					chaves = remaining
					b, err := json.Marshal(queryParamsChaves{Chaves: chaves})
					if err != nil {
						return err
					}
					params = b
					req.ParamsJSON = params
				}
			}
		}

		_, err := tx.Exec(ctx, `
			insert into fiscal_document_query_requests (
				id, organization_id, organization_company_id, requested_by_user_id,
				query_type, params_json, status, created_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
		`, req.ID, req.OrganizationID, req.OrganizationCompanyID, req.RequestedByUserID,
			req.QueryType, params, req.Status, now)
		if err != nil {
			return err
		}

		for _, chave := range chaves {
			_, err := tx.Exec(ctx, `
				insert into fiscal_document_query_items (id, query_request_id, chave, status)
				values ($1,$2,$3,$4)
			`, ids.New(), req.ID, chave, QueryItemStatusPending)
			if err != nil {
				return err
			}
		}

		_, err = messaging.InsertOutbox(ctx, tx, in.OrganizationID, "fiscal_document_query_requests", req.ID, messaging.EventDocumentQueryRequested, map[string]any{
			"query_request_id":        req.ID,
			"organization_company_id": req.OrganizationCompanyID,
			"query_type":              req.QueryType,
		})
		return err
	})
	if err != nil {
		return nil, err
	}
	return req, nil
}

func (s *QueryService) List(ctx context.Context, organizationID uuid.UUID, limit int) ([]QueryRequest, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, requested_by_user_id,
		       query_type, params_json, status, result_summary_json, created_at, completed_at
		from fiscal_document_query_requests
		where organization_id = $1
		order by created_at desc
		limit $2
	`, organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []QueryRequest{}
	for rows.Next() {
		var q QueryRequest
		if err := rows.Scan(&q.ID, &q.OrganizationID, &q.OrganizationCompanyID, &q.RequestedByUserID,
			&q.QueryType, &q.ParamsJSON, &q.Status, &q.ResultSummaryJSON, &q.CreatedAt, &q.CompletedAt); err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, rows.Err()
}

func (s *QueryService) Get(ctx context.Context, organizationID, queryRequestID uuid.UUID) (*QueryRequestWithItems, error) {
	var q QueryRequest
	err := s.pool.QueryRow(ctx, `
		select id, organization_id, organization_company_id, requested_by_user_id,
		       query_type, params_json, status, result_summary_json, created_at, completed_at
		from fiscal_document_query_requests
		where organization_id = $1 and id = $2
	`, organizationID, queryRequestID).Scan(&q.ID, &q.OrganizationID, &q.OrganizationCompanyID, &q.RequestedByUserID,
		&q.QueryType, &q.ParamsJSON, &q.Status, &q.ResultSummaryJSON, &q.CreatedAt, &q.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("query_request_not_found", "Query request not found")
	}
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		select id, query_request_id, chave, status, document_id, error_message, resolved_at
		from fiscal_document_query_items
		where query_request_id = $1
		order by chave
	`, queryRequestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []QueryItem
	for rows.Next() {
		var it QueryItem
		if err := rows.Scan(&it.ID, &it.QueryRequestID, &it.Chave, &it.Status, &it.DocumentID, &it.ErrorMessage, &it.ResolvedAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return &QueryRequestWithItems{QueryRequest: q, Items: items}, rows.Err()
}

// claimForNotification atomically marks a query request as notified,
// returning false when another delivery of the same at-least-once
// query_result event already claimed it — the same "conditional update,
// check rows affected" idempotency shape as fiscal.Worker's status-machine
// updates, applied here to guard notification creation instead.
func (s *QueryService) claimForNotification(ctx context.Context, queryRequestID uuid.UUID) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		update fiscal_document_query_requests
		set notified_at = now()
		where id = $1 and notified_at is null
	`, queryRequestID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func inFlightChaves(ctx context.Context, tx pgx.Tx, organizationID, companyID uuid.UUID, chaves []string) (map[string]uuid.UUID, error) {
	out := make(map[string]uuid.UUID, len(chaves))
	if len(chaves) == 0 {
		return out, nil
	}
	rows, err := tx.Query(ctx, `
		select i.chave, r.id
		from fiscal_document_query_items i
		join fiscal_document_query_requests r on r.id = i.query_request_id
		where r.organization_id = $1
		  and r.organization_company_id = $2
		  and i.chave = any($3)
		  and r.status in ('pending', 'processing')
		  and i.status = 'pending'
		order by r.created_at
	`, organizationID, companyID, chaves)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var chave string
		var requestID uuid.UUID
		if err := rows.Scan(&chave, &requestID); err != nil {
			return nil, err
		}
		if _, exists := out[chave]; !exists {
			out[chave] = requestID
		}
	}
	return out, rows.Err()
}

func getQueryRequest(ctx context.Context, tx pgx.Tx, organizationID, queryRequestID uuid.UUID) (*QueryRequest, error) {
	var q QueryRequest
	err := tx.QueryRow(ctx, `
		select id, organization_id, organization_company_id, requested_by_user_id,
		       query_type, params_json, status, result_summary_json, created_at, completed_at
		from fiscal_document_query_requests
		where organization_id = $1 and id = $2
	`, organizationID, queryRequestID).Scan(
		&q.ID, &q.OrganizationID, &q.OrganizationCompanyID, &q.RequestedByUserID,
		&q.QueryType, &q.ParamsJSON, &q.Status, &q.ResultSummaryJSON, &q.CreatedAt, &q.CompletedAt)
	if err != nil {
		return nil, err
	}
	return &q, nil
}

func firstOrEmpty(v []string) string {
	if len(v) == 0 {
		return ""
	}
	return v[0]
}

func normalizeChave(raw string) (string, error) {
	chave := strings.TrimSpace(raw)
	if len(chave) != chaveLength {
		return "", domainerr.Validation("invalid_chave", "chave must contain exactly 44 digits")
	}
	for _, r := range chave {
		if !unicode.IsDigit(r) {
			return "", domainerr.Validation("invalid_chave", "chave must contain only digits")
		}
	}
	return chave, nil
}

func normalizeChaves(raw []string) ([]string, error) {
	if len(raw) == 0 {
		return nil, domainerr.Validation("chaves_required", "at least one chave is required")
	}
	if len(raw) > MaxBatchChaves {
		return nil, domainerr.Validation("too_many_chaves", "a single batch is limited to 100 chaves; split larger backfills into multiple requests")
	}
	seen := make(map[string]bool, len(raw))
	out := make([]string, 0, len(raw))
	for _, r := range raw {
		chave, err := normalizeChave(r)
		if err != nil {
			return nil, err
		}
		if seen[chave] {
			continue
		}
		seen[chave] = true
		out = append(out, chave)
	}
	return out, nil
}
