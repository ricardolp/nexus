package support

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

type Service struct {
	pool        *db.Pool
	store       storage.ObjectStore
	environment string
}

func NewService(pool *db.Pool, store storage.ObjectStore, appEnv string) *Service {
	return &Service{
		pool:        pool,
		store:       store,
		environment: ResolveEnvironment(appEnv),
	}
}

func (s *Service) Environment() string {
	return s.environment
}

func (s *Service) Config() Config {
	return Config{
		Environment:       s.environment,
		AllowedPriorities: AllowedPriorities(s.environment),
	}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*Ticket, error) {
	subject, html, text, rawPriority, links, err := ValidateCreateInput(in)
	if err != nil {
		return nil, err
	}
	priority, err := NormalizePriority(rawPriority, s.environment)
	if err != nil {
		return nil, err
	}
	hours := SLAHours(priority)
	now := time.Now().UTC()
	ticket := Ticket{
		ID:             ids.New(),
		OrganizationID: in.OrganizationID,
		OpenedByUserID: in.OpenedByUserID,
		Subject:        subject,
		Status:         StatusOpen,
		Priority:       priority,
		SLAHours:       hours,
		SLADueAt:       now.Add(time.Duration(hours) * time.Hour),
		Environment:    s.environment,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	messageID := ids.New()
	eventID := ids.New()

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `select id from organizations where id = $1 for update`, in.OrganizationID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `
			select coalesce(max(public_number), 0) + 1 from support_tickets where organization_id = $1
		`, in.OrganizationID).Scan(&ticket.PublicNumber); err != nil {
			return err
		}
		ticket.PublicID = FormatPublicID(ticket.PublicNumber)

		if _, err := tx.Exec(ctx, `
			insert into support_tickets (
				id, organization_id, opened_by_user_id, public_number, subject, status, priority,
				sla_hours, sla_due_at, environment, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		`, ticket.ID, ticket.OrganizationID, ticket.OpenedByUserID, ticket.PublicNumber, ticket.Subject,
			ticket.Status, ticket.Priority, ticket.SLAHours, ticket.SLADueAt, ticket.Environment,
			ticket.CreatedAt, ticket.UpdatedAt); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			insert into support_ticket_messages (
				id, organization_id, ticket_id, author_user_id, body_html, body_text, created_at
			) values ($1,$2,$3,$4,$5,$6,$7)
		`, messageID, in.OrganizationID, ticket.ID, in.OpenedByUserID, html, text, now); err != nil {
			return err
		}

		for _, link := range links {
			if _, err := tx.Exec(ctx, `
				insert into support_ticket_document_links (
					id, organization_id, ticket_id, document_number, document_type, fiscal_document_id, created_at
				) values ($1,$2,$3,$4,$5,$6,$7)
			`, ids.New(), in.OrganizationID, ticket.ID, link.DocumentNumber, link.DocumentType, link.FiscalDocumentID, now); err != nil {
				return err
			}
		}

		_, err := tx.Exec(ctx, `
			insert into support_ticket_events (
				id, organization_id, ticket_id, event_type, to_status, actor_user_id, occurred_at
			) values ($1,$2,$3,$4,$5,$6,$7)
		`, eventID, in.OrganizationID, ticket.ID, EventCreated, ticket.Status, in.OpenedByUserID, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, in.OrganizationID, ticket.ID, nil)
}

func (s *Service) List(ctx context.Context, in ListInput) (*ListResult, error) {
	if in.OrganizationID == uuid.Nil {
		return nil, domainerr.Validation("organization_id_required", "organization_id is required")
	}
	status, err := NormalizeStatusFilter(in.Status)
	if err != nil {
		return nil, err
	}
	page, limit := NormalizePage(in.Page, in.Limit)
	offset := (page - 1) * limit

	where := "t.organization_id = $1"
	args := []any{in.OrganizationID}
	arg := 2
	if in.OpenedByUserID != nil {
		where += fmt.Sprintf(" and t.opened_by_user_id = $%d", arg)
		args = append(args, *in.OpenedByUserID)
		arg++
	}
	if status != "" {
		where += fmt.Sprintf(" and t.status = $%d", arg)
		args = append(args, status)
		arg++
	}

	countSQL := `select count(*) from support_tickets t where ` + where
	var total int
	if err := s.pool.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, err
	}

	counts := map[string]int{
		StatusOpen: 0, StatusInProgress: 0, StatusResolved: 0, StatusClosed: 0,
	}
	countWhere := "organization_id = $1"
	countArgs := []any{in.OrganizationID}
	if in.OpenedByUserID != nil {
		countWhere += " and opened_by_user_id = $2"
		countArgs = append(countArgs, *in.OpenedByUserID)
	}
	rows, err := s.pool.Query(ctx, `
		select status, count(*) from support_tickets where `+countWhere+` group by status
	`, countArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var st string
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, err
		}
		counts[st] = n
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	listSQL := fmt.Sprintf(`
		select
			t.id, t.organization_id, t.opened_by_user_id, coalesce(u.email, ''),
			t.public_number, t.subject, t.status, t.priority, t.sla_hours, t.sla_due_at,
			t.environment, t.created_at, t.updated_at,
			coalesce((
				select m.body_text from support_ticket_messages m
				where m.ticket_id = t.id order by m.created_at asc limit 1
			), ''),
			(select count(*) from support_attachments a where a.ticket_id = t.id)
		from support_tickets t
		left join users u on u.id = t.opened_by_user_id
		where %s
		order by t.created_at desc
		limit $%d offset $%d
	`, where, arg, arg+1)
	args = append(args, limit, offset)

	listRows, err := s.pool.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, err
	}
	defer listRows.Close()

	items := []Ticket{}
	for listRows.Next() {
		var t Ticket
		if err := listRows.Scan(
			&t.ID, &t.OrganizationID, &t.OpenedByUserID, &t.OpenedByEmail,
			&t.PublicNumber, &t.Subject, &t.Status, &t.Priority, &t.SLAHours, &t.SLADueAt,
			&t.Environment, &t.CreatedAt, &t.UpdatedAt, &t.Preview, &t.AttachmentCount,
		); err != nil {
			return nil, err
		}
		t.PublicID = FormatPublicID(t.PublicNumber)
		items = append(items, t)
	}
	if err := listRows.Err(); err != nil {
		return nil, err
	}

	return &ListResult{Items: items, Total: total, Page: page, Limit: limit, Counts: counts}, nil
}

func (s *Service) Get(ctx context.Context, organizationID, ticketID uuid.UUID, openedBy *uuid.UUID) (*Ticket, error) {
	ticket, err := s.getHeader(ctx, organizationID, ticketID, openedBy)
	if err != nil {
		return nil, err
	}
	messages, err := s.listMessages(ctx, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	attachments, err := s.listAttachments(ctx, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	links, err := s.listDocumentLinks(ctx, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	events, err := s.listEvents(ctx, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	ticket.Messages = messages
	ticket.Attachments = attachments
	ticket.DocumentLinks = links
	ticket.Events = events
	ticket.AttachmentCount = len(attachments)
	return ticket, nil
}

func (s *Service) AddMessage(ctx context.Context, in AddMessageInput) (*Ticket, error) {
	html, text, err := NormalizeBody(in.BodyHTML)
	if err != nil {
		return nil, err
	}
	if _, err := s.getHeader(ctx, in.OrganizationID, in.TicketID, nil); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into support_ticket_messages (
				id, organization_id, ticket_id, author_user_id, body_html, body_text, created_at
			) values ($1,$2,$3,$4,$5,$6,$7)
		`, ids.New(), in.OrganizationID, in.TicketID, in.AuthorUserID, html, text, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update support_tickets set status = case when status in ('resolved', 'closed') then 'open' else status end,
				updated_at = $3
			where id = $1 and organization_id = $2
		`, in.TicketID, in.OrganizationID, now); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `
			insert into support_ticket_events (
				id, organization_id, ticket_id, event_type, actor_user_id, occurred_at
			) values ($1,$2,$3,$4,$5,$6)
		`, ids.New(), in.OrganizationID, in.TicketID, EventReplied, in.AuthorUserID, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, in.OrganizationID, in.TicketID, nil)
}

func (s *Service) AddAttachment(ctx context.Context, in AddAttachmentInput) (*Attachment, error) {
	if s.store == nil {
		return nil, domainerr.New(503, "storage_unavailable", "Service Unavailable", "Object storage is not configured")
	}
	if _, err := s.getHeader(ctx, in.OrganizationID, in.TicketID, nil); err != nil {
		return nil, err
	}
	filename, contentType, err := validateAttachment(in.Filename, in.ContentType, in.Data)
	if err != nil {
		return nil, err
	}
	var count int
	if err := s.pool.QueryRow(ctx, `
		select count(*) from support_attachments where organization_id = $1 and ticket_id = $2
	`, in.OrganizationID, in.TicketID).Scan(&count); err != nil {
		return nil, err
	}
	if count >= MaxAttachments {
		return nil, domainerr.Validation("too_many_attachments", "a ticket may have at most 10 attachments")
	}

	att := Attachment{
		ID:               ids.New(),
		TicketID:         in.TicketID,
		MessageID:        in.MessageID,
		OriginalFilename: filename,
		ContentType:      contentType,
		SHA256:           crypto.SHA256Hex(in.Data),
		SizeBytes:        int64(len(in.Data)),
		CreatedByUserID:  in.CreatedBy,
		CreatedAt:        time.Now().UTC(),
	}
	key := fmt.Sprintf("%s/%s/%s/%s", ObjectPrefix, in.OrganizationID.String(), in.TicketID.String(), att.ID.String())
	if err := s.store.Put(ctx, key, contentType, in.Data); err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx, `
		insert into support_attachments (
			id, organization_id, ticket_id, message_id, original_filename, content_type,
			storage_object_key, sha256, size_bytes, created_by_user_id, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, att.ID, in.OrganizationID, in.TicketID, in.MessageID, att.OriginalFilename, att.ContentType,
		key, att.SHA256, att.SizeBytes, att.CreatedByUserID, att.CreatedAt)
	if err != nil {
		_ = s.store.Delete(ctx, key)
		return nil, err
	}
	meta, _ := json.Marshal(map[string]string{"filename": filename})
	_, _ = s.pool.Exec(ctx, `
		insert into support_ticket_events (
			id, organization_id, ticket_id, event_type, actor_user_id, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7)
	`, ids.New(), in.OrganizationID, in.TicketID, EventAttached, in.CreatedBy, meta, att.CreatedAt)
	_, _ = s.pool.Exec(ctx, `
		update support_tickets set updated_at = $3 where id = $1 and organization_id = $2
	`, in.TicketID, in.OrganizationID, att.CreatedAt)
	return &att, nil
}

func (s *Service) GetAttachment(ctx context.Context, organizationID, ticketID, attachmentID uuid.UUID, openedBy *uuid.UUID) ([]byte, *Attachment, error) {
	if s.store == nil {
		return nil, nil, domainerr.New(503, "storage_unavailable", "Service Unavailable", "Object storage is not configured")
	}
	if _, err := s.getHeader(ctx, organizationID, ticketID, openedBy); err != nil {
		return nil, nil, err
	}
	var att Attachment
	var key string
	err := s.pool.QueryRow(ctx, `
		select id, ticket_id, message_id, original_filename, content_type, storage_object_key, sha256, size_bytes, created_by_user_id, created_at
		from support_attachments
		where organization_id = $1 and ticket_id = $2 and id = $3
	`, organizationID, ticketID, attachmentID).Scan(
		&att.ID, &att.TicketID, &att.MessageID, &att.OriginalFilename, &att.ContentType, &key,
		&att.SHA256, &att.SizeBytes, &att.CreatedByUserID, &att.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, domainerr.NotFound("attachment_not_found", "Attachment not found")
		}
		return nil, nil, err
	}
	data, err := s.store.Get(ctx, key)
	if err != nil {
		return nil, nil, domainerr.NotFound("attachment_not_found", "Attachment not found")
	}
	return data, &att, nil
}

func (s *Service) getHeader(ctx context.Context, organizationID, ticketID uuid.UUID, openedBy *uuid.UUID) (*Ticket, error) {
	query := `
		select
			t.id, t.organization_id, t.opened_by_user_id, coalesce(u.email, ''),
			t.public_number, t.subject, t.status, t.priority, t.sla_hours, t.sla_due_at,
			t.environment, t.created_at, t.updated_at
		from support_tickets t
		left join users u on u.id = t.opened_by_user_id
		where t.organization_id = $1 and t.id = $2
	`
	args := []any{organizationID, ticketID}
	if openedBy != nil {
		query += " and t.opened_by_user_id = $3"
		args = append(args, *openedBy)
	}
	var t Ticket
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&t.ID, &t.OrganizationID, &t.OpenedByUserID, &t.OpenedByEmail,
		&t.PublicNumber, &t.Subject, &t.Status, &t.Priority, &t.SLAHours, &t.SLADueAt,
		&t.Environment, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("ticket_not_found", "Ticket not found")
		}
		return nil, err
	}
	t.PublicID = FormatPublicID(t.PublicNumber)
	return &t, nil
}

func (s *Service) listMessages(ctx context.Context, organizationID, ticketID uuid.UUID) ([]Message, error) {
	rows, err := s.pool.Query(ctx, `
		select m.id, m.ticket_id, m.author_user_id, coalesce(u.email, ''), m.body_html, m.body_text, m.created_at
		from support_ticket_messages m
		left join users u on u.id = m.author_user_id
		where m.organization_id = $1 and m.ticket_id = $2
		order by m.created_at asc
	`, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.TicketID, &m.AuthorUserID, &m.AuthorEmail, &m.BodyHTML, &m.BodyText, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) listAttachments(ctx context.Context, organizationID, ticketID uuid.UUID) ([]Attachment, error) {
	rows, err := s.pool.Query(ctx, `
		select id, ticket_id, message_id, original_filename, content_type, sha256, size_bytes, created_by_user_id, created_at
		from support_attachments
		where organization_id = $1 and ticket_id = $2
		order by created_at asc
	`, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Attachment{}
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.TicketID, &a.MessageID, &a.OriginalFilename, &a.ContentType, &a.SHA256, &a.SizeBytes, &a.CreatedByUserID, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Service) listDocumentLinks(ctx context.Context, organizationID, ticketID uuid.UUID) ([]DocumentLink, error) {
	rows, err := s.pool.Query(ctx, `
		select id, ticket_id, document_number, document_type, fiscal_document_id
		from support_ticket_document_links
		where organization_id = $1 and ticket_id = $2
		order by created_at asc
	`, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DocumentLink{}
	for rows.Next() {
		var l DocumentLink
		if err := rows.Scan(&l.ID, &l.TicketID, &l.DocumentNumber, &l.DocumentType, &l.FiscalDocumentID); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Service) listEvents(ctx context.Context, organizationID, ticketID uuid.UUID) ([]Event, error) {
	rows, err := s.pool.Query(ctx, `
		select id, ticket_id, event_type, from_status, to_status, actor_user_id, occurred_at
		from support_ticket_events
		where organization_id = $1 and ticket_id = $2
		order by occurred_at asc
	`, organizationID, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.TicketID, &e.EventType, &e.FromStatus, &e.ToStatus, &e.ActorUserID, &e.OccurredAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func validateAttachment(filename, contentType string, data []byte) (string, string, error) {
	if len(data) == 0 {
		return "", "", domainerr.Validation("empty_attachment", "attachment file is required")
	}
	if len(data) > MaxAttachmentB {
		return "", "", domainerr.Validation("attachment_too_large", "attachment must be at most 5 MB")
	}
	name := filepath.Base(strings.ReplaceAll(strings.TrimSpace(filename), "\\", "/"))
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." {
		return "", "", domainerr.Validation("invalid_filename", "attachment filename is required")
	}
	if len(name) > MaxFilenameLen {
		name = name[:MaxFilenameLen]
	}
	ct := strings.ToLower(strings.TrimSpace(contentType))
	if ct == "" || ct == "application/octet-stream" {
		ct = sniffContentType(name, data)
	}
	if !allowedContentType(ct, name) {
		return "", "", domainerr.Validation("invalid_attachment_type", "attachment type is not allowed")
	}
	return name, ct, nil
}

func sniffContentType(filename string, data []byte) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".xml":
		return "application/xml"
	case ".csv":
		return "text/csv"
	case ".txt":
		return "text/plain"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".zip":
		return "application/zip"
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	}
	if len(data) >= 4 && string(data[:4]) == "%PDF" {
		return "application/pdf"
	}
	return "application/octet-stream"
}

func allowedContentType(ct, filename string) bool {
	switch {
	case strings.HasPrefix(ct, "image/"):
		return true
	case strings.HasPrefix(ct, "text/"):
		return true
	case ct == "application/pdf", ct == "application/xml", ct == "text/xml",
		ct == "application/zip", ct == "application/json",
		ct == "application/vnd.ms-excel",
		ct == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		return true
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".pdf", ".xml", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".zip", ".xlsx", ".xls":
		return true
	}
	return false
}
