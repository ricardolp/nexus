package webhook

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

var eventTypePattern = regexp.MustCompile(`^[a-z0-9]+(?:[._-][a-z0-9]+)*$`)

type Service struct {
	pool   *db.Pool
	client *http.Client
}

func NewService(pool *db.Pool) *Service {
	return &Service{
		pool: pool,
		client: &http.Client{
			Timeout: 15 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (s *Service) CreateEndpoint(ctx context.Context, in CreateEndpointInput) (*CreatedEndpoint, error) {
	in.URL = strings.TrimSpace(in.URL)
	if err := ValidateURL(in.URL); err != nil {
		return nil, err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return nil, domainerr.Validation("invalid_webhook", "name is required")
	}
	if len(in.Name) > 200 {
		return nil, domainerr.Validation("invalid_webhook", "name must contain at most 200 characters")
	}
	eventTypes, err := normalizeEventTypes(in.EventTypes)
	if err != nil {
		return nil, err
	}
	secret, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	ep := Endpoint{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: in.OrganizationCompanyID,
		Name:                  in.Name,
		URL:                   in.URL,
		Status:                "active",
		APIVersion:            "v1",
		TimeoutMS:             10000,
		MaxAttempts:           8,
		CreatedAt:             now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if in.OrganizationCompanyID != nil {
			var exists bool
			if err := tx.QueryRow(ctx, `
				select exists(
					select 1 from organization_companies
					where id = $1 and organization_id = $2 and status = 'active'
				)
			`, *in.OrganizationCompanyID, in.OrganizationID).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return domainerr.Validation("invalid_company_id", "organization_company_id must belong to the organization")
			}
		}
		_, err := tx.Exec(ctx, `
			insert into organization_webhook_endpoints (
				id, organization_id, organization_company_id, name, url, status, secret_ref,
				api_version, timeout_ms, max_attempts, created_at, updated_at
			) values ($1,$2,$3,$4,$5,'active',$6,'v1',10000,8,$7,$7)
		`, ep.ID, ep.OrganizationID, ep.OrganizationCompanyID, ep.Name, ep.URL, "dev:"+secret, now)
		if err != nil {
			return err
		}

		for _, et := range eventTypes {
			_, err = tx.Exec(ctx, `
				insert into organization_webhook_subscriptions (
					id, organization_id, webhook_endpoint_id, event_type, status, created_at
				) values ($1,$2,$3,$4,'active',$5)
			`, ids.New(), in.OrganizationID, ep.ID, et, now)
			if err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &CreatedEndpoint{Endpoint: ep, Secret: secret}, nil
}

func (s *Service) ListEndpoints(ctx context.Context, organizationID uuid.UUID) ([]Endpoint, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, name, url, status, api_version, timeout_ms, max_attempts, created_at
		from organization_webhook_endpoints
		where organization_id = $1
		order by created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Endpoint
	for rows.Next() {
		var e Endpoint
		if err := rows.Scan(&e.ID, &e.OrganizationID, &e.OrganizationCompanyID, &e.Name, &e.URL, &e.Status, &e.APIVersion, &e.TimeoutMS, &e.MaxAttempts, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func normalizeEventTypes(values []string) ([]string, error) {
	if len(values) == 0 {
		return []string{
			"fiscal.document.received.v1",
			"fiscal.document.authorized.v1",
			"fiscal.document.rejected.v1",
			"fiscal.document.failed.v1",
		}, nil
	}
	if len(values) > 50 {
		return nil, domainerr.Validation("invalid_event_types", "at most 50 event_types are allowed")
	}
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		eventType := strings.ToLower(strings.TrimSpace(value))
		if len(eventType) > 120 || !eventTypePattern.MatchString(eventType) {
			return nil, domainerr.Validation("invalid_event_type", "event_types must use lowercase letters, numbers, dots, hyphens or underscores")
		}
		if _, duplicate := seen[eventType]; duplicate {
			continue
		}
		seen[eventType] = struct{}{}
		result = append(result, eventType)
	}
	return result, nil
}

func (s *Service) EnqueueFromDomainEvent(ctx context.Context, organizationID uuid.UUID, eventType string, aggregateType string, aggregateID uuid.UUID, payload any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		eventID := ids.New()
		_, err := tx.Exec(ctx, `
			insert into webhook_events (
				id, organization_id, event_type, aggregate_type, aggregate_id, payload_json, status, created_at
			) values ($1,$2,$3,$4,$5,$6,'pending',now())
		`, eventID, organizationID, eventType, aggregateType, aggregateID, body)
		if err != nil {
			return err
		}

		rows, err := tx.Query(ctx, `
			select e.id
			from organization_webhook_endpoints e
			join organization_webhook_subscriptions s on s.webhook_endpoint_id = e.id
			where e.organization_id = $1
			  and e.status = 'active'
			  and s.status = 'active'
			  and s.event_type = $2
		`, organizationID, eventType)
		if err != nil {
			return err
		}
		endpointIDs, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
		if err != nil {
			return err
		}

		for _, endpointID := range endpointIDs {
			_, err = tx.Exec(ctx, `
				insert into webhook_deliveries (
					id, organization_id, webhook_event_id, webhook_endpoint_id, attempt_number,
					outcome, next_attempt_at, created_at
				) values ($1,$2,$3,$4,0,'pending',now(),now())
			`, ids.New(), organizationID, eventID, endpointID)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

type pendingDelivery struct {
	DeliveryID  uuid.UUID
	EventID     uuid.UUID
	EndpointID  uuid.UUID
	OrgID       uuid.UUID
	URL         string
	SecretRef   string
	TimeoutMS   int
	MaxAttempts int
	Attempt     int
	EventType   string
	PayloadJSON []byte
}

func (s *Service) ProcessDueDeliveries(ctx context.Context, limit int) (int, error) {
	var items []pendingDelivery
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			select d.id, d.webhook_event_id, d.webhook_endpoint_id, d.organization_id,
			       e.url, e.secret_ref, e.timeout_ms, e.max_attempts, d.attempt_number,
			       we.event_type, we.payload_json
			from webhook_deliveries d
			join organization_webhook_endpoints e on e.id = d.webhook_endpoint_id
			join webhook_events we on we.id = d.webhook_event_id
			where d.outcome in ('pending','retry_scheduled')
			  and coalesce(d.next_attempt_at, now()) <= now()
			  and e.status = 'active'
			order by d.next_attempt_at nulls first
			limit $1
			for update of d skip locked
		`, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var item pendingDelivery
			if err := rows.Scan(
				&item.DeliveryID, &item.EventID, &item.EndpointID, &item.OrgID,
				&item.URL, &item.SecretRef, &item.TimeoutMS, &item.MaxAttempts, &item.Attempt,
				&item.EventType, &item.PayloadJSON,
			); err != nil {
				return err
			}
			items = append(items, item)
		}
		for _, item := range items {
			if _, err := tx.Exec(ctx, `update webhook_deliveries set outcome = 'delivering' where id = $1`, item.DeliveryID); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}

	processed := 0
	for _, item := range items {
		if err := s.deliverOne(ctx, item); err != nil {
			return processed, err
		}
		processed++
	}
	return processed, nil
}

func (s *Service) deliverOne(ctx context.Context, item pendingDelivery) error {
	secret := strings.TrimPrefix(item.SecretRef, "dev:")
	attempt := item.Attempt + 1
	ts := fmt.Sprintf("%d", time.Now().UTC().Unix())
	sig := SignPayload(secret, ts, item.PayloadJSON)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, item.URL, bytes.NewReader(item.PayloadJSON))
	if err != nil {
		return s.finishDelivery(ctx, item, attempt, 0, 0, "failed", err.Error(), true)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x_webhook_id", item.EventID.String())
	req.Header.Set("x_webhook_timestamp", ts)
	req.Header.Set("x_webhook_signature", sig)
	req.Header.Set("x_event_type", item.EventType)

	client := s.client
	if item.TimeoutMS > 0 {
		client = &http.Client{Timeout: time.Duration(item.TimeoutMS) * time.Millisecond}
	}

	start := time.Now()
	resp, err := client.Do(req)
	duration := int(time.Since(start).Milliseconds())
	if err != nil {
		return s.finishDelivery(ctx, item, attempt, 0, duration, "retry_scheduled", err.Error(), true)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<20))

	if IsSuccessHTTPStatus(resp.StatusCode) {
		return s.finishDelivery(ctx, item, attempt, resp.StatusCode, duration, "delivered", "", false)
	}
	retryable := IsRetryableHTTPStatus(resp.StatusCode)
	outcome := "failed"
	if retryable {
		outcome = "retry_scheduled"
	}
	return s.finishDelivery(ctx, item, attempt, resp.StatusCode, duration, outcome, fmt.Sprintf("http_%d", resp.StatusCode), retryable)
}

func (s *Service) finishDelivery(ctx context.Context, item pendingDelivery, attempt, httpStatus, durationMS int, outcome, errMsg string, retryable bool) error {
	return s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var nextAttempt any
		finalOutcome := outcome
		if outcome == "retry_scheduled" {
			if attempt >= item.MaxAttempts {
				finalOutcome = "dead_letter"
			} else {
				nextAttempt = time.Now().UTC().Add(NextBackoff(attempt))
			}
		}
		var deliveredAt any
		if finalOutcome == "delivered" {
			deliveredAt = time.Now().UTC()
		}

		var httpStatusVal any
		if httpStatus != 0 {
			httpStatusVal = httpStatus
		}
		var errMsgVal any
		if errMsg != "" {
			errMsgVal = errMsg
		}

		_, err := tx.Exec(ctx, `
			update webhook_deliveries
			set attempt_number = $2,
			    http_status = $3,
			    duration_ms = $4,
			    outcome = $5,
			    next_attempt_at = $6,
			    delivered_at = $7,
			    error_message_sanitized = $8
			where id = $1
		`, item.DeliveryID, attempt, httpStatusVal, durationMS, finalOutcome, nextAttempt, deliveredAt, errMsgVal)
		if err != nil {
			return err
		}

		eventStatus := "delivering"
		switch finalOutcome {
		case "delivered":
			eventStatus = "delivered"
		case "dead_letter":
			eventStatus = "dead_letter"
		case "failed":
			if !retryable {
				eventStatus = "failed"
			}
		}
		_, err = tx.Exec(ctx, `update webhook_events set status = $2 where id = $1`, item.EventID, eventStatus)
		return err
	})
}
