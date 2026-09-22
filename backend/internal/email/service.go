package email

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/mailer"
)

const secretRefPrefix = "enc:"

type Service struct {
	pool          *db.Pool
	encryptionKey []byte
	fiscal        FiscalReader
	store         ObjectStore
	objectPrefix  string
}

type FiscalReader interface {
	GetDocument(ctx context.Context, organizationID, documentID uuid.UUID) (*FiscalDocument, error)
	DownloadOriginalPayload(ctx context.Context, organizationID, documentID uuid.UUID) (*PayloadDownload, error)
}

type FiscalDocument struct {
	ID                    uuid.UUID
	OrganizationID        uuid.UUID
	OrganizationCompanyID uuid.UUID
	DocumentType          string
	Direction             string
	Status                string
	DocumentKey           *string
}

type PayloadDownload struct {
	Data        []byte
	ContentType string
	Filename    string
}

type ObjectStore interface {
	Get(ctx context.Context, key string) ([]byte, error)
}

func NewService(pool *db.Pool, encryptionKey []byte, fiscal FiscalReader, store ObjectStore, objectPrefix string) *Service {
	return &Service{
		pool:          pool,
		encryptionKey: encryptionKey,
		fiscal:        fiscal,
		store:         store,
		objectPrefix:  objectPrefix,
	}
}

func (s *Service) GetCredentials(ctx context.Context, organizationID uuid.UUID) (*Credentials, error) {
	row := s.pool.QueryRow(ctx, `
		select organization_id, host, port, username, (password_encrypted is not null) as has_password,
		       from_name, from_address, status, last_tested_at, last_test_error, created_at, updated_at
		from organization_email_credentials
		where organization_id = $1
	`, organizationID)

	var c Credentials
	err := row.Scan(&c.OrganizationID, &c.Host, &c.Port, &c.Username, &c.HasPassword,
		&c.FromName, &c.FromAddress, &c.Status, &c.LastTestedAt, &c.LastTestError, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return &Credentials{
			OrganizationID: organizationID,
			Host:           "",
			Port:           587,
			Status:         StatusDisabled,
			CreatedAt:      time.Now().UTC(),
			UpdatedAt:      time.Now().UTC(),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Service) UpsertCredentials(ctx context.Context, in UpdateCredentialsInput) (*Credentials, error) {
	if in.Port <= 0 || in.Port > 65535 {
		return nil, domainerr.Validation("invalid_port", "port must be between 1 and 65535")
	}
	if in.Status != "" && in.Status != StatusActive && in.Status != StatusDisabled {
		return nil, domainerr.Validation("invalid_status", "status must be active or disabled")
	}
	fromAddr := strings.TrimSpace(in.FromAddress)
	if fromAddr != "" {
		normalized, err := normalizeFromAddress(fromAddr)
		if err != nil {
			return nil, err
		}
		fromAddr = normalized
	}

	encrypted, err := s.encryptPassword(in.Password)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	id := ids.New()
	status := in.Status
	if status == "" {
		status = StatusDisabled
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var existingID uuid.UUID
		err := tx.QueryRow(ctx, `select id from organization_email_credentials where organization_id = $1`, in.OrganizationID).Scan(&existingID)
		if errors.Is(err, pgx.ErrNoRows) {
			_, err = tx.Exec(ctx, `
				insert into organization_email_credentials (
					id, organization_id, host, port, username, password_encrypted,
					from_name, from_address, status, created_at, updated_at
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
			`, id, in.OrganizationID, strings.TrimSpace(in.Host), in.Port, strings.TrimSpace(in.Username),
				encrypted, strings.TrimSpace(in.FromName), fromAddr, status, now)
			return err
		}
		if err != nil {
			return err
		}
		if encrypted != nil {
			_, err = tx.Exec(ctx, `
				update organization_email_credentials
				set host = $2, port = $3, username = $4, password_encrypted = $5,
				    from_name = $6, from_address = $7, status = $8, updated_at = $9
				where organization_id = $1
			`, in.OrganizationID, strings.TrimSpace(in.Host), in.Port, strings.TrimSpace(in.Username),
				encrypted, strings.TrimSpace(in.FromName), fromAddr, status, now)
			return err
		}
		_, err = tx.Exec(ctx, `
			update organization_email_credentials
			set host = $2, port = $3, username = $4,
			    from_name = $5, from_address = $6, status = $7, updated_at = $8
			where organization_id = $1
		`, in.OrganizationID, strings.TrimSpace(in.Host), in.Port, strings.TrimSpace(in.Username),
			strings.TrimSpace(in.FromName), fromAddr, status, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.GetCredentials(ctx, in.OrganizationID)
}

func (s *Service) TestCredentials(ctx context.Context, organizationID uuid.UUID, to string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return domainerr.Validation("invalid_email", "test recipient is required")
	}
	normalized, err := normalizeAddress(to)
	if err != nil {
		return err
	}

	creds, err := s.loadActiveCredentials(ctx, organizationID)
	if err != nil {
		return err
	}
	sender := mailer.NewSMTPSender(creds.smtpConfig())
	from, err := mailer.ParseFrom(creds.fromLine())
	if err != nil {
		return domainerr.Validation("invalid_from", err.Error())
	}
	msg := mailer.Message{
		From:      from,
		To:        []string{normalized},
		Subject:   "Teste de e-mail — Nexus",
		PlainBody: "Este é um e-mail de teste enviado pela configuração SMTP da sua organização no Nexus.",
		HTMLBody:  "<p>Este é um e-mail de teste enviado pela configuração SMTP da sua organização no Nexus.</p>",
	}
	if err := sender.Send(ctx, msg); err != nil {
		now := time.Now().UTC()
		errMsg := err.Error()
		_, _ = s.pool.Exec(ctx, `
			update organization_email_credentials
			set last_tested_at = $2, last_test_error = $3, updated_at = $2
			where organization_id = $1
		`, organizationID, now, errMsg)
		return domainerr.Validation("smtp_test_failed", errMsg)
	}
	now := time.Now().UTC()
	_, _ = s.pool.Exec(ctx, `
		update organization_email_credentials
		set last_tested_at = $2, last_test_error = null, updated_at = $2
		where organization_id = $1
	`, organizationID, now)
	return nil
}

type loadedCredentials struct {
	Host        string
	Port        int
	Username    string
	Password    string
	FromName    string
	FromAddress string
	Status      string
}

func (c loadedCredentials) smtpConfig() mailer.SMTPConfig {
	return mailer.SMTPConfig{
		Host:     c.Host,
		Port:     c.Port,
		Username: c.Username,
		Password: c.Password,
		From:     c.fromLine(),
	}
}

func (c loadedCredentials) fromLine() string {
	if c.FromName != "" {
		return c.FromName + " <" + c.FromAddress + ">"
	}
	return c.FromAddress
}

func (s *Service) loadActiveCredentials(ctx context.Context, organizationID uuid.UUID) (*loadedCredentials, error) {
	row := s.pool.QueryRow(ctx, `
		select host, port, username, password_encrypted, from_name, from_address, status
		from organization_email_credentials
		where organization_id = $1
	`, organizationID)
	var c loadedCredentials
	var encrypted *string
	err := row.Scan(&c.Host, &c.Port, &c.Username, &encrypted, &c.FromName, &c.FromAddress, &c.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.Validation("smtp_not_configured", "SMTP credentials are not configured")
	}
	if err != nil {
		return nil, err
	}
	if c.Status != StatusActive {
		return nil, domainerr.Validation("smtp_disabled", "SMTP is disabled for this organization")
	}
	if encrypted == nil || *encrypted == "" {
		return nil, domainerr.Validation("smtp_not_configured", "SMTP password is not set")
	}
	password, err := s.decryptPassword(*encrypted)
	if err != nil {
		return nil, err
	}
	c.Password = password
	if strings.TrimSpace(c.FromAddress) == "" {
		return nil, domainerr.Validation("invalid_from", "from address is required")
	}
	return &c, nil
}

func (s *Service) encryptPassword(password *string) (*string, error) {
	if password == nil {
		return nil, nil
	}
	if *password == "" {
		empty := ""
		return &empty, nil
	}
	if len(s.encryptionKey) != 32 {
		return nil, domainerr.Validation("encryption_key_missing", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	enc, err := crypto.Encrypt(s.encryptionKey, []byte(*password))
	if err != nil {
		return nil, err
	}
	ref := secretRefPrefix + enc
	return &ref, nil
}

func (s *Service) decryptPassword(ref string) (string, error) {
	if !strings.HasPrefix(ref, secretRefPrefix) {
		return "", domainerr.Validation("invalid_secret", "invalid encrypted password")
	}
	if len(s.encryptionKey) != 32 {
		return "", domainerr.Validation("encryption_key_missing", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	raw, err := crypto.Decrypt(s.encryptionKey, strings.TrimPrefix(ref, secretRefPrefix))
	if err != nil {
		return "", err
	}
	return string(raw), nil
}
