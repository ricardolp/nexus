package integration

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// secretRefPrefix marks a secret_ref value produced by Service.encryptSecret,
// as opposed to legacy/dev-style refs (e.g. webhook's "dev:" convention) that
// other packages in this repo may still use.
const secretRefPrefix = "enc:"

type Service struct {
	pool          *db.Pool
	encryptionKey []byte
}

func NewService(pool *db.Pool, encryptionKey []byte) *Service {
	return &Service{pool: pool, encryptionKey: encryptionKey}
}

func (s *Service) Create(ctx context.Context, in CreateInput) (*Integration, error) {
	if err := validateCreateInput(in); err != nil {
		return nil, err
	}

	secretRef, err := s.encryptSecret(in.ClientSecret)
	if err != nil {
		return nil, err
	}

	configJSON, err := json.Marshal(in.Configuration)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	row := &Integration{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: in.OrganizationCompanyID,
		Name:                  in.Name,
		IntegrationType:       in.IntegrationType,
		Environment:           in.Environment,
		BaseURL:               nullEmpty(in.BaseURL),
		Status:                StatusActive,
		HasSecret:             secretRef != nil,
		ConfigurationJSON:     configJSON,
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_integrations (
				id, organization_id, organization_company_id, name, integration_type,
				environment, base_url, status, secret_ref, configuration_json, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		`, row.ID, row.OrganizationID, row.OrganizationCompanyID, row.Name, row.IntegrationType,
			row.Environment, row.BaseURL, row.Status, secretRef, configJSON, now, now)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "integration.create",
			ResourceType:   "organization_integrations",
			ResourceID:     row.ID.String(),
			After:          row,
		})
	})
	if err != nil {
		return nil, err
	}
	return row, nil
}

func (s *Service) List(ctx context.Context, organizationID uuid.UUID) ([]Integration, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, name, integration_type, environment,
		       base_url, status, (secret_ref is not null) as has_secret, configuration_json, created_at, updated_at
		from organization_integrations
		where organization_id = $1
		order by created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Integration
	for rows.Next() {
		var i Integration
		if err := rows.Scan(&i.ID, &i.OrganizationID, &i.OrganizationCompanyID, &i.Name, &i.IntegrationType,
			&i.Environment, &i.BaseURL, &i.Status, &i.HasSecret, &i.ConfigurationJSON, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	return out, nil
}

func (s *Service) Get(ctx context.Context, organizationID, id uuid.UUID) (*Integration, error) {
	return s.scan(ctx, `
		select id, organization_id, organization_company_id, name, integration_type, environment,
		       base_url, status, (secret_ref is not null) as has_secret, configuration_json, created_at, updated_at
		from organization_integrations
		where organization_id = $1 and id = $2
	`, organizationID, id)
}

func (s *Service) Update(ctx context.Context, in UpdateInput) (*Integration, error) {
	existing, err := s.Get(ctx, in.OrganizationID, in.ID)
	if err != nil {
		return nil, err
	}
	before := *existing

	name := in.Name
	if name == "" {
		name = existing.Name
	}
	baseURL := in.BaseURL
	if baseURL == "" && existing.BaseURL != nil {
		baseURL = *existing.BaseURL
	}
	status := in.Status
	if status == "" {
		status = existing.Status
	}
	if _, ok := allowedStatuses[status]; !ok {
		return nil, domainerr.Validation("invalid_status", "status must be active, disabled or error")
	}

	configJSON, err := json.Marshal(in.Configuration)
	if err != nil {
		return nil, err
	}

	var secretRefUpdate any = sqlKeepCurrent{}
	if in.ClientSecret != nil {
		ref, err := s.encryptSecret(*in.ClientSecret)
		if err != nil {
			return nil, err
		}
		secretRefUpdate = ref
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var execErr error
		if _, keep := secretRefUpdate.(sqlKeepCurrent); keep {
			_, execErr = tx.Exec(ctx, `
				update organization_integrations
				set name = $3, base_url = $4, status = $5, configuration_json = $6, updated_at = $7
				where organization_id = $1 and id = $2
			`, in.OrganizationID, in.ID, name, nullEmpty(baseURL), status, configJSON, now)
		} else {
			_, execErr = tx.Exec(ctx, `
				update organization_integrations
				set name = $3, base_url = $4, status = $5, configuration_json = $6, secret_ref = $7, updated_at = $8
				where organization_id = $1 and id = $2
			`, in.OrganizationID, in.ID, name, nullEmpty(baseURL), status, configJSON, secretRefUpdate, now)
		}
		if execErr != nil {
			return execErr
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "integration.update",
			ResourceType:   "organization_integrations",
			ResourceID:     in.ID.String(),
			Before:         before,
		})
	})
	if err != nil {
		return nil, err
	}
	return s.Get(ctx, in.OrganizationID, in.ID)
}

// sqlKeepCurrent is a sentinel used only to pick which UPDATE statement to
// run (with or without touching secret_ref) — never sent to the driver.
type sqlKeepCurrent struct{}

// ResolveActive finds the active integration of integrationType for a
// company, preferring a company-specific row and falling back to the
// organization-wide default (organization_company_id is null) — mirrors the
// legacy getSapInboundAdapter fallback.
func (s *Service) ResolveActive(ctx context.Context, organizationID uuid.UUID, companyID *uuid.UUID, integrationType string) (*Integration, error) {
	if companyID != nil {
		row, err := s.scan(ctx, `
			select id, organization_id, organization_company_id, name, integration_type, environment,
			       base_url, status, (secret_ref is not null) as has_secret, configuration_json, created_at, updated_at
			from organization_integrations
			where organization_id = $1 and organization_company_id = $2 and integration_type = $3 and status = 'active'
			order by created_at desc limit 1
		`, organizationID, *companyID, integrationType)
		if err == nil {
			return row, nil
		}
		if !isNotFound(err) {
			return nil, err
		}
	}
	return s.scan(ctx, `
		select id, organization_id, organization_company_id, name, integration_type, environment,
		       base_url, status, (secret_ref is not null) as has_secret, configuration_json, created_at, updated_at
		from organization_integrations
		where organization_id = $1 and organization_company_id is null and integration_type = $2 and status = 'active'
		order by created_at desc limit 1
	`, organizationID, integrationType)
}

// DecryptSecret returns the plaintext client_secret for integration id, or
// "" if none is configured.
func (s *Service) DecryptSecret(ctx context.Context, organizationID, id uuid.UUID) (string, error) {
	var secretRef *string
	err := s.pool.QueryRow(ctx, `
		select secret_ref from organization_integrations where organization_id = $1 and id = $2
	`, organizationID, id).Scan(&secretRef)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", domainerr.NotFound("integration_not_found", "Integration not found")
	}
	if err != nil {
		return "", err
	}
	if secretRef == nil {
		return "", nil
	}
	return s.decryptSecret(*secretRef)
}

func (s *Service) encryptSecret(plaintext string) (*string, error) {
	if plaintext == "" {
		return nil, nil
	}
	if len(s.encryptionKey) == 0 {
		return nil, domainerr.New(503, "secrets_encryption_unavailable", "Secrets storage unavailable", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	ciphertext, err := crypto.Encrypt(s.encryptionKey, []byte(plaintext))
	if err != nil {
		return nil, err
	}
	ref := secretRefPrefix + ciphertext
	return &ref, nil
}

func (s *Service) decryptSecret(ref string) (string, error) {
	if len(ref) <= len(secretRefPrefix) || ref[:len(secretRefPrefix)] != secretRefPrefix {
		return "", domainerr.New(500, "unsupported_secret_ref", "Unsupported secret reference", "secret_ref was not produced by this service")
	}
	if len(s.encryptionKey) == 0 {
		return "", domainerr.New(503, "secrets_encryption_unavailable", "Secrets storage unavailable", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	plaintext, err := crypto.Decrypt(s.encryptionKey, ref[len(secretRefPrefix):])
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func (s *Service) scan(ctx context.Context, query string, args ...any) (*Integration, error) {
	row := s.pool.QueryRow(ctx, query, args...)
	var i Integration
	if err := row.Scan(&i.ID, &i.OrganizationID, &i.OrganizationCompanyID, &i.Name, &i.IntegrationType,
		&i.Environment, &i.BaseURL, &i.Status, &i.HasSecret, &i.ConfigurationJSON, &i.CreatedAt, &i.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("integration_not_found", "Integration not found")
		}
		return nil, err
	}
	return &i, nil
}

func isNotFound(err error) bool {
	var de *domainerr.Error
	if errors.As(err, &de) {
		return de.Code == "integration_not_found"
	}
	return false
}

func nullEmpty(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
