package nfseprovider

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

const secretRefPrefix = "enc:"

type Service struct {
	pool          *db.Pool
	encryptionKey []byte
}

func NewService(pool *db.Pool, encryptionKey []byte) *Service {
	return &Service{pool: pool, encryptionKey: encryptionKey}
}

// Resolve decide o provedor de uma NFS-e da empresa emitida no município
// (IBGE do prestador). Ver ResolveRoute para a regra.
func (s *Service) Resolve(ctx context.Context, organizationID, companyID uuid.UUID, municipalityCode string) (Route, error) {
	municipalityCode = strings.TrimSpace(municipalityCode)
	var catalog *MunicipalProvider
	if len(municipalityCode) == 7 {
		row, err := s.GetMunicipal(ctx, municipalityCode)
		if err != nil && !isNotFound(err) {
			return Route{}, err
		}
		catalog = row
	}
	settings, err := s.ListCompanySettings(ctx, organizationID, companyID)
	if err != nil {
		return Route{}, err
	}
	route := ResolveRoute(municipalityCode, catalog, settings)
	if _, ok := Lookup(route.ProviderCode); !ok {
		return Route{}, domainerr.Validation("nfse_provider_unknown",
			"Provedor de NFS-e '"+route.ProviderCode+"' não é suportado pela plataforma")
	}
	return route, nil
}

// HasCredentials diz se a empresa tem usuário cadastrado para o provedor.
func (s *Service) HasCredentials(ctx context.Context, organizationID, companyID uuid.UUID, providerCode string) (bool, error) {
	var username *string
	err := s.pool.QueryRow(ctx, `
		select nullif(trim(username), '')
		from organization_company_nfse_provider_settings
		where organization_id = $1 and organization_company_id = $2 and provider_code = $3
	`, organizationID, companyID, NormalizeCode(providerCode)).Scan(&username)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return username != nil, nil
}

// Credentials devolve usuário e senha em claro — só para o internal_api.
func (s *Service) Credentials(ctx context.Context, organizationID, companyID uuid.UUID, providerCode string) (*Credentials, error) {
	var username, secretRef *string
	err := s.pool.QueryRow(ctx, `
		select nullif(trim(username), ''), secret_ref
		from organization_company_nfse_provider_settings
		where organization_id = $1 and organization_company_id = $2 and provider_code = $3
	`, organizationID, companyID, NormalizeCode(providerCode)).Scan(&username, &secretRef)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && username == nil) {
		return nil, domainerr.NotFound("nfse_provider_credentials_not_found",
			"Empresa sem usuário/senha do webservice municipal de NFS-e ("+NormalizeCode(providerCode)+"). Cadastre em Configurações → Empresas → NFS-e municipal.")
	}
	if err != nil {
		return nil, err
	}
	out := &Credentials{Username: *username}
	if secretRef != nil && *secretRef != "" {
		pw, err := s.decrypt(*secretRef)
		if err != nil {
			return nil, err
		}
		out.Password = pw
	}
	return out, nil
}

func (s *Service) ListMunicipal(ctx context.Context) ([]MunicipalProvider, error) {
	rows, err := s.pool.Query(ctx, `
		select ibge_municipality_code, municipality_name, uf, provider_code, provider_config, enabled, notes, updated_at
		from nfse_municipal_providers
		order by uf, municipality_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []MunicipalProvider{}
	for rows.Next() {
		var m MunicipalProvider
		if err := rows.Scan(&m.IBGEMunicipalityCode, &m.MunicipalityName, &m.UF, &m.ProviderCode,
			&m.ProviderConfig, &m.Enabled, &m.Notes, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if d, ok := Lookup(m.ProviderCode); ok {
			m.ProviderName = d.Name
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Service) GetMunicipal(ctx context.Context, ibge string) (*MunicipalProvider, error) {
	var m MunicipalProvider
	err := s.pool.QueryRow(ctx, `
		select ibge_municipality_code, municipality_name, uf, provider_code, provider_config, enabled, notes, updated_at
		from nfse_municipal_providers
		where ibge_municipality_code = $1
	`, strings.TrimSpace(ibge)).Scan(&m.IBGEMunicipalityCode, &m.MunicipalityName, &m.UF, &m.ProviderCode,
		&m.ProviderConfig, &m.Enabled, &m.Notes, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("nfse_municipal_provider_not_found", "Município sem provedor específico (usa SEFIN Nacional)")
	}
	if err != nil {
		return nil, err
	}
	if d, ok := Lookup(m.ProviderCode); ok {
		m.ProviderName = d.Name
	}
	return &m, nil
}

func (s *Service) ListCompanySettings(ctx context.Context, organizationID, companyID uuid.UUID) ([]CompanySettings, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, provider_code, username,
		       coalesce(secret_ref, '') <> '', config_overrides, force_route, created_at, updated_at
		from organization_company_nfse_provider_settings
		where organization_id = $1 and organization_company_id = $2
		order by provider_code
	`, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CompanySettings{}
	for rows.Next() {
		var c CompanySettings
		if err := rows.Scan(&c.ID, &c.OrganizationID, &c.OrganizationCompanyID, &c.ProviderCode, &c.Username,
			&c.HasPassword, &c.ConfigOverrides, &c.ForceRoute, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Service) GetCompanySettings(ctx context.Context, organizationID, companyID uuid.UUID, providerCode string) (*CompanySettings, error) {
	items, err := s.ListCompanySettings(ctx, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	code := NormalizeCode(providerCode)
	for i := range items {
		if NormalizeCode(items[i].ProviderCode) == code {
			return &items[i], nil
		}
	}
	return nil, domainerr.NotFound("nfse_provider_settings_not_found", "Empresa sem configuração para o provedor "+code)
}

func (s *Service) UpsertCompanySettings(ctx context.Context, in UpsertSettingsInput) (*CompanySettings, error) {
	code := NormalizeCode(in.ProviderCode)
	desc, ok := Lookup(code)
	if !ok {
		return nil, domainerr.Validation("nfse_provider_unknown", "Provedor de NFS-e '"+code+"' não é suportado")
	}
	if desc.Credentials == CredentialsNone && (in.Username != nil || in.Password != nil) {
		return nil, domainerr.Validation("nfse_provider_no_credentials", "O provedor "+code+" não usa usuário/senha")
	}
	var secretRef *string
	if in.Password != nil && *in.Password != "" {
		ref, err := s.encrypt(*in.Password)
		if err != nil {
			return nil, err
		}
		secretRef = &ref
	}
	var overrides []byte
	if in.ConfigOverrides != nil {
		if _, bad := in.ConfigOverrides["password"]; bad {
			return nil, domainerr.Validation("nfse_provider_secret_in_config", "Senha não pode ir em config_overrides")
		}
		b, err := json.Marshal(in.ConfigOverrides)
		if err != nil {
			return nil, err
		}
		overrides = b
	}
	var username *string
	if in.Username != nil {
		u := strings.TrimSpace(*in.Username)
		username = &u
	}
	clearPassword := in.Password != nil && *in.Password == ""

	now := time.Now().UTC()
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var companyOK bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
		`, in.OrganizationCompanyID, in.OrganizationID).Scan(&companyOK); err != nil {
			return err
		}
		if !companyOK {
			return domainerr.NotFound("company_not_found", "Company not found")
		}
		_, err := tx.Exec(ctx, `
			insert into organization_company_nfse_provider_settings (
				id, organization_id, organization_company_id, provider_code, username, secret_ref,
				config_overrides, force_route, created_by, updated_by, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,coalesce($7::jsonb, '{}'::jsonb),coalesce($8, false),$9,$9,$10,$10)
			on conflict (organization_company_id, provider_code) do update set
				username = coalesce(excluded.username, organization_company_nfse_provider_settings.username),
				secret_ref = case
					when $11 then null
					when excluded.secret_ref is not null then excluded.secret_ref
					else organization_company_nfse_provider_settings.secret_ref end,
				config_overrides = case when $7::jsonb is null
					then organization_company_nfse_provider_settings.config_overrides
					else excluded.config_overrides end,
				force_route = coalesce($8, organization_company_nfse_provider_settings.force_route),
				updated_by = excluded.updated_by,
				updated_at = excluded.updated_at
		`, ids.New(), in.OrganizationID, in.OrganizationCompanyID, code, username, secretRef,
			nullJSON(overrides), in.ForceRoute, in.ActorUserID, now, clearPassword)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "company.nfse_provider_settings.upsert",
			ResourceType:   "organization_company_nfse_provider_settings",
			ResourceID:     in.OrganizationCompanyID.String() + ":" + code,
			After: map[string]any{
				"provider_code":    code,
				"username":         username,
				"password_changed": secretRef != nil || clearPassword,
				"force_route":      in.ForceRoute,
				"config_overrides": in.ConfigOverrides,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetCompanySettings(ctx, in.OrganizationID, in.OrganizationCompanyID, code)
}

func (s *Service) DeleteCompanySettings(ctx context.Context, organizationID, companyID uuid.UUID, providerCode string, actorUserID uuid.UUID) error {
	code := NormalizeCode(providerCode)
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			delete from organization_company_nfse_provider_settings
			where organization_id = $1 and organization_company_id = $2 and provider_code = $3
		`, organizationID, companyID, code)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("nfse_provider_settings_not_found", "Empresa sem configuração para o provedor "+code)
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "company.nfse_provider_settings.delete",
			ResourceType:   "organization_company_nfse_provider_settings",
			ResourceID:     companyID.String() + ":" + code,
		})
	})
}

func (s *Service) encrypt(plaintext string) (string, error) {
	if len(s.encryptionKey) == 0 {
		return "", domainerr.New(503, "secrets_encryption_unavailable", "Secrets storage unavailable", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	ciphertext, err := crypto.Encrypt(s.encryptionKey, []byte(plaintext))
	if err != nil {
		return "", err
	}
	return secretRefPrefix + ciphertext, nil
}

func (s *Service) decrypt(ref string) (string, error) {
	if !strings.HasPrefix(ref, secretRefPrefix) {
		return "", domainerr.New(500, "unsupported_secret_ref", "Unsupported secret reference", "secret_ref was not produced by this service")
	}
	if len(s.encryptionKey) == 0 {
		return "", domainerr.New(503, "secrets_encryption_unavailable", "Secrets storage unavailable", "SECRETS_ENCRYPTION_KEY is not configured")
	}
	plaintext, err := crypto.Decrypt(s.encryptionKey, strings.TrimPrefix(ref, secretRefPrefix))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func nullJSON(b []byte) any {
	if b == nil {
		return nil
	}
	return string(b)
}

func isNotFound(err error) bool {
	var de *domainerr.Error
	return errors.As(err, &de) && de.Status == 404
}
