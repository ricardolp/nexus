package messaging

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type OutboxEvent struct {
	ID             uuid.UUID
	OrganizationID uuid.UUID
	AggregateType  string
	AggregateID    uuid.UUID
	EventType      string
	PayloadJSON    []byte
	Status         string
	AttemptCount   int
	AvailableAt    time.Time
}

func InsertOutbox(ctx context.Context, tx pgx.Tx, organizationID uuid.UUID, aggregateType string, aggregateID uuid.UUID, eventType string, data any) (uuid.UUID, error) {
	return InsertOutboxFrom(ctx, tx, organizationID, "fiscal_saas/inbound_api", aggregateType, aggregateID, eventType, data)
}

func InsertOutboxFrom(ctx context.Context, tx pgx.Tx, organizationID uuid.UUID, source, aggregateType string, aggregateID uuid.UUID, eventType string, data any) (uuid.UUID, error) {
	eventID := ids.New()
	_, payload, err := NewCloudEvent(eventID, organizationID, aggregateID, source, eventType, aggregateType, data)
	if err != nil {
		return uuid.Nil, err
	}

	_, err = tx.Exec(ctx, `
		insert into outbox_events (
			id, organization_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempt_count, available_at, created_at
		) values ($1,$2,$3,$4,$5,$6,'pending',0,now(),now())
	`, eventID, organizationID, aggregateType, aggregateID, eventType, payload)
	return eventID, err
}

func ClaimPendingOutbox(ctx context.Context, tx pgx.Tx, limit int) ([]OutboxEvent, error) {
	rows, err := tx.Query(ctx, `
		select id, organization_id, aggregate_type, aggregate_id, event_type, payload_json, status, attempt_count, available_at
		from outbox_events
		where status in ('pending','failed') and available_at <= now()
		order by available_at
		limit $1
		for update skip locked
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []OutboxEvent
	for rows.Next() {
		var e OutboxEvent
		if err := rows.Scan(&e.ID, &e.OrganizationID, &e.AggregateType, &e.AggregateID, &e.EventType, &e.PayloadJSON, &e.Status, &e.AttemptCount, &e.AvailableAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

func MarkPublished(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	_, err := tx.Exec(ctx, `
		update outbox_events
		set status = 'published', published_at = now(), attempt_count = attempt_count + 1
		where id = $1
	`, id)
	return err
}

func MarkFailed(ctx context.Context, tx pgx.Tx, id uuid.UUID, cause string, backoff time.Duration) error {
	_, err := tx.Exec(ctx, `
		update outbox_events
		set status = 'failed',
		    attempt_count = attempt_count + 1,
		    available_at = $2,
		    last_error = $3
		where id = $1
	`, id, time.Now().UTC().Add(backoff), cause)
	return err
}

func TryClaimInbox(ctx context.Context, tx pgx.Tx, consumerName string, eventID uuid.UUID, organizationID uuid.UUID) (bool, error) {
	tag, err := tx.Exec(ctx, `
		insert into inbox_events (id, consumer_name, event_id, organization_id, result, processed_at)
		values ($1,$2,$3,$4,'processing',now())
		on conflict (consumer_name, event_id) do nothing
	`, ids.New(), consumerName, eventID, organizationID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func CompleteInbox(ctx context.Context, tx pgx.Tx, consumerName string, eventID uuid.UUID, result string) error {
	_, err := tx.Exec(ctx, `
		update inbox_events set result = $3 where consumer_name = $1 and event_id = $2
	`, consumerName, eventID, result)
	return err
}
