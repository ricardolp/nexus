package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type Event struct {
	OrganizationID *uuid.UUID
	ActorType      string
	ActorID        string
	Action         string
	ResourceType   string
	ResourceID     string
	Reason         string
	Before         any
	After          any
	IPAddress      *string
	UserAgent      *string
	CorrelationID  *uuid.UUID
}

func Write(ctx context.Context, tx pgx.Tx, e Event) error {
	var beforeJSON, afterJSON []byte
	var err error
	if e.Before != nil {
		beforeJSON, err = json.Marshal(e.Before)
		if err != nil {
			return err
		}
	}
	if e.After != nil {
		afterJSON, err = json.Marshal(e.After)
		if err != nil {
			return err
		}
	}

	_, err = tx.Exec(ctx, `
		insert into audit_events (
			id, organization_id, actor_type, actor_id, action, resource_type, resource_id,
			reason, before_json, after_json, ip_address, user_agent, correlation_id, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	`,
		ids.New(),
		e.OrganizationID,
		e.ActorType,
		e.ActorID,
		e.Action,
		e.ResourceType,
		nullIfEmpty(e.ResourceID),
		nullIfEmpty(e.Reason),
		nullableJSON(beforeJSON),
		nullableJSON(afterJSON),
		e.IPAddress,
		e.UserAgent,
		e.CorrelationID,
		time.Now().UTC(),
	)
	return err
}

func nullIfEmpty(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func nullableJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}

type Record struct {
	ID             uuid.UUID       `json:"id"`
	OrganizationID *uuid.UUID      `json:"organization_id,omitempty"`
	ActorType      string          `json:"actor_type"`
	ActorID        *string         `json:"actor_id,omitempty"`
	Action         string          `json:"action"`
	ResourceType   string          `json:"resource_type"`
	ResourceID     *string         `json:"resource_id,omitempty"`
	Reason         *string         `json:"reason,omitempty"`
	After          json.RawMessage `json:"after,omitempty"`
	IPAddress      *string         `json:"ip_address,omitempty"`
	UserAgent      *string         `json:"user_agent,omitempty"`
	OccurredAt     time.Time       `json:"occurred_at"`
}

type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// ListForUser returns governance events where the user is the actor or the
// affected resource. When organizationID is set, results are scoped to that
// tenant — platform admins pass nil to see the full trail.
func ListForUser(ctx context.Context, q Querier, userID uuid.UUID, organizationID *uuid.UUID, limit int) ([]Record, error) {
	if userID == uuid.Nil {
		return nil, nil
	}
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := q.Query(ctx, `
		select id, organization_id, actor_type, actor_id, action, resource_type, resource_id,
		       reason, after_json, host(ip_address)::text, user_agent, occurred_at
		from audit_events
		where (
		    actor_id = $1
		    or (resource_type = 'users' and resource_id = $1)
		    or (
		      resource_type = 'organization_members'
		      and resource_id in (
		        select m.id::text from organization_members m where m.user_id = $1::uuid
		      )
		    )
		  )
		  and ($2::uuid is null or organization_id = $2)
		order by occurred_at desc
		limit $3
	`, userID.String(), organizationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Record
	for rows.Next() {
		var rec Record
		if err := rows.Scan(
			&rec.ID, &rec.OrganizationID, &rec.ActorType, &rec.ActorID, &rec.Action,
			&rec.ResourceType, &rec.ResourceID, &rec.Reason, &rec.After, &rec.IPAddress,
			&rec.UserAgent, &rec.OccurredAt,
		); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}
