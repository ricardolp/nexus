package notification

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type Service struct {
	pool *db.Pool
}

func NewService(pool *db.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*Notification, error) {
	typ, title, body, err := ValidateCreateInput(in)
	if err != nil {
		return nil, err
	}
	var dataJSON []byte
	if in.Data != nil {
		dataJSON, err = json.Marshal(in.Data)
		if err != nil {
			return nil, err
		}
	}

	now := time.Now().UTC()
	n := Notification{
		ID:             ids.New(),
		UserID:         in.UserID,
		OrganizationID: in.OrganizationID,
		Type:           typ,
		Title:          title,
		Body:           body,
		Data:           dataJSON,
		CreatedAt:      now,
	}
	_, err = s.pool.Exec(ctx, `
		insert into notifications (
			id, user_id, organization_id, type, title, body, data_json, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8)
	`, n.ID, n.UserID, n.OrganizationID, n.Type, n.Title, n.Body, dataJSON, now)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

func (s *Service) List(ctx context.Context, in ListInput) ([]Notification, error) {
	if in.UserID == uuid.Nil {
		return nil, domainerr.Validation("user_id_required", "user_id is required")
	}
	limit := NormalizeListLimit(in.Limit)

	query := `
		select id, user_id, organization_id, type, title, body, data_json, read_at, created_at
		from notifications
		where user_id = $1
	`
	args := []any{in.UserID}
	if in.UnreadOnly {
		query += " and read_at is null"
	}
	query += " order by created_at desc limit $2"
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []Notification{}
	for rows.Next() {
		var n Notification
		if err := rows.Scan(
			&n.ID, &n.UserID, &n.OrganizationID, &n.Type, &n.Title, &n.Body, &n.Data, &n.ReadAt, &n.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Service) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx, `
		select count(*) from notifications where user_id = $1 and read_at is null
	`, userID).Scan(&count)
	return count, err
}

// MarkRead marks a single notification as read for the given user. It is
// idempotent — marking an already-read notification again keeps its
// original read_at instead of bumping it.
func (s *Service) MarkRead(ctx context.Context, userID, notificationID uuid.UUID) (*Notification, error) {
	now := time.Now().UTC()
	row := s.pool.QueryRow(ctx, `
		update notifications
		set read_at = coalesce(read_at, $3)
		where id = $1 and user_id = $2
		returning id, user_id, organization_id, type, title, body, data_json, read_at, created_at
	`, notificationID, userID, now)

	var n Notification
	if err := row.Scan(
		&n.ID, &n.UserID, &n.OrganizationID, &n.Type, &n.Title, &n.Body, &n.Data, &n.ReadAt, &n.CreatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("notification_not_found", "Notification not found")
		}
		return nil, err
	}
	return &n, nil
}

func (s *Service) MarkAllRead(ctx context.Context, userID uuid.UUID) (int, error) {
	tag, err := s.pool.Exec(ctx, `
		update notifications set read_at = now() where user_id = $1 and read_at is null
	`, userID)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}
