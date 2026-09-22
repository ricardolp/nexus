package email

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func (s *Service) ListMessages(ctx context.Context, in ListMessagesInput) ([]Message, error) {
	limit := in.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	query := `
		select m.id, m.organization_id, m.organization_company_id, m.organization_document_id,
		       m.template_id, m.process_code, m.status, m.from_name, m.from_address,
		       m.to_addresses, m.cc_addresses, m.subject, m.body_html, m.body_plain,
		       m.sent_at, m.attempt_count, m.last_error, m.created_at, m.updated_at,
		       c.legal_name, c.trade_name
		from organization_email_messages m
		join organization_companies c on c.id = m.organization_company_id
		where m.organization_id = $1
	`
	args := []any{in.OrganizationID}
	if in.CompanyID != nil {
		args = append(args, *in.CompanyID)
		query += fmt.Sprintf(" and m.organization_company_id = $%d", len(args))
	}
	if in.ProcessCode != "" {
		args = append(args, in.ProcessCode)
		query += fmt.Sprintf(" and m.process_code = $%d", len(args))
	}
	if in.Status != "" {
		args = append(args, in.Status)
		query += fmt.Sprintf(" and m.status = $%d", len(args))
	}
	if q := strings.TrimSpace(in.Query); q != "" {
		args = append(args, "%"+q+"%")
		query += fmt.Sprintf(" and (m.subject ilike $%d or m.to_addresses::text ilike $%d)", len(args), len(args))
	}
	args = append(args, limit)
	query += fmt.Sprintf(" order by m.created_at desc limit $%d", len(args))

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Message
	for rows.Next() {
		m, err := scanMessageRow(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) GetMessage(ctx context.Context, organizationID, messageID uuid.UUID) (*Message, error) {
	row := s.pool.QueryRow(ctx, `
		select m.id, m.organization_id, m.organization_company_id, m.organization_document_id,
		       m.template_id, m.process_code, m.status, m.from_name, m.from_address,
		       m.to_addresses, m.cc_addresses, m.subject, m.body_html, m.body_plain,
		       m.sent_at, m.attempt_count, m.last_error, m.created_at, m.updated_at,
		       c.legal_name, c.trade_name
		from organization_email_messages m
		join organization_companies c on c.id = m.organization_company_id
		where m.organization_id = $1 and m.id = $2
	`, organizationID, messageID)

	m, err := scanMessageRow(row, false)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("message_not_found", "Email message not found")
	}
	if err != nil {
		return nil, err
	}

	atts, err := s.listAttachments(ctx, organizationID, messageID)
	if err != nil {
		return nil, err
	}
	m.Attachments = atts
	return &m, nil
}

func (s *Service) DownloadAttachment(ctx context.Context, organizationID, messageID, attachmentID uuid.UUID) ([]byte, string, string, error) {
	row := s.pool.QueryRow(ctx, `
		select kind, filename, content_type, storage_ref, available
		from organization_email_message_attachments
		where organization_id = $1 and message_id = $2 and id = $3
	`, organizationID, messageID, attachmentID)

	var kind, filename, contentType string
	var storageRef *string
	var available bool
	if err := row.Scan(&kind, &filename, &contentType, &storageRef, &available); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", "", domainerr.NotFound("attachment_not_found", "Attachment not found")
		}
		return nil, "", "", err
	}
	if !available || storageRef == nil || *storageRef == "" {
		return nil, "", "", domainerr.NotFound("attachment_unavailable", "Attachment is not available yet")
	}

	data, err := s.store.Get(ctx, *storageRef)
	if err != nil {
		return nil, "", "", err
	}
	if filename == "" {
		filename = kind + ".bin"
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return data, filename, contentType, nil
}

func (s *Service) listAttachments(ctx context.Context, organizationID, messageID uuid.UUID) ([]Attachment, error) {
	rows, err := s.pool.Query(ctx, `
		select id, message_id, kind, filename, content_type, available, created_at
		from organization_email_message_attachments
		where organization_id = $1 and message_id = $2
		order by created_at
	`, organizationID, messageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Attachment
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(&a.ID, &a.MessageID, &a.Kind, &a.Filename, &a.ContentType, &a.Available, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type messageScanner interface {
	Scan(dest ...any) error
}

func scanMessageRow(scanner messageScanner, _ bool) (Message, error) {
	var m Message
	var docID *uuid.UUID
	var templateID *uuid.UUID
	var sentAt *time.Time
	var lastError *string
	var tradeName *string
	err := scanner.Scan(
		&m.ID, &m.OrganizationID, &m.OrganizationCompanyID, &docID, &templateID,
		&m.ProcessCode, &m.Status, &m.FromName, &m.FromAddress,
		&m.ToAddresses, &m.CcAddresses, &m.Subject, &m.BodyHTML, &m.BodyPlain,
		&sentAt, &m.AttemptCount, &lastError, &m.CreatedAt, &m.UpdatedAt,
		&m.CompanyLegalName, &tradeName,
	)
	if err != nil {
		return m, err
	}
	m.OrganizationDocumentID = docID
	m.TemplateID = templateID
	m.SentAt = sentAt
	m.LastError = lastError
	m.CompanyTradeName = tradeName
	if def, ok := processByCode(m.ProcessCode); ok {
		m.ProcessLabel = def.Label
	}
	return m, nil
}
