package organization

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
	"github.com/nexus/fiscal-messaging/internal/platform/cnpja"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type CompanyCNAE struct {
	ID                    uuid.UUID `json:"id"`
	OrganizationID        uuid.UUID `json:"organization_id"`
	OrganizationCompanyID uuid.UUID `json:"organization_company_id"`
	CNAECode              string    `json:"cnae_code"`
	CNAEDescription       *string   `json:"cnae_description,omitempty"`
	IsPrimary             bool      `json:"is_primary"`
	Enabled               bool      `json:"enabled"`
	Source                string    `json:"-"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

const companyCNAESelect = `
	select id, organization_id, organization_company_id, cnae_code, cnae_description,
	       is_primary, enabled, source, created_at, updated_at
	from organization_company_cnaes`

func scanCompanyCNAE(row interface{ Scan(dest ...any) error }) (CompanyCNAE, error) {
	var item CompanyCNAE
	err := row.Scan(
		&item.ID, &item.OrganizationID, &item.OrganizationCompanyID, &item.CNAECode, &item.CNAEDescription,
		&item.IsPrimary, &item.Enabled, &item.Source, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *Service) ListCompanyCNAEs(ctx context.Context, organizationID, companyID uuid.UUID) ([]CompanyCNAE, error) {
	if err := s.ensureCompany(ctx, organizationID, companyID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, companyCNAESelect+`
		where organization_id = $1 and organization_company_id = $2
		order by is_primary desc, enabled desc, cnae_code
	`, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CompanyCNAE
	for rows.Next() {
		item, err := scanCompanyCNAE(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) UpdateCompanyCNAEEnabled(
	ctx context.Context,
	organizationID, companyID, cnaeID uuid.UUID,
	enabled bool,
	actorUserID uuid.UUID,
) (*CompanyCNAE, error) {
	if err := s.ensureCompany(ctx, organizationID, companyID); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	var out CompanyCNAE
	err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_company_cnaes
			set enabled = $4, updated_at = $5
			where organization_id = $1 and organization_company_id = $2 and id = $3
		`, organizationID, companyID, cnaeID, enabled, now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("company_cnae_not_found", "Company CNAE not found")
		}
		row := tx.QueryRow(ctx, companyCNAESelect+` where id = $1`, cnaeID)
		out, err = scanCompanyCNAE(row)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "company.cnae.update",
			ResourceType:   "organization_company_cnaes",
			ResourceID:     cnaeID.String(),
			After:          map[string]any{"enabled": enabled, "cnae_code": out.CNAECode},
		})
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// SyncCompanyCNAEsFromCNPJ looks up the company CNPJ in the public registry and upserts the company CNAE set.
// Existing enabled flags are preserved across syncs.
func (s *Service) SyncCompanyCNAEsFromCNPJ(ctx context.Context, organizationID, companyID, actorUserID uuid.UUID) ([]CompanyCNAE, error) {
	var cnpj string
	if err := s.pool.QueryRow(ctx, `
		select cnpj from organization_companies where id = $1 and organization_id = $2
	`, companyID, organizationID).Scan(&cnpj); err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("company_not_found", "Company not found")
		}
		return nil, err
	}

	summary, err := cnpja.NewClient().LookupOffice(ctx, cnpj)
	if err != nil {
		return nil, err
	}

	type incoming struct {
		code        string
		description string
		primary     bool
	}
	var items []incoming
	seen := map[string]bool{}
	if summary.MainActivity != nil {
		code := onlyDigits(summary.MainActivity.Code)
		if len(code) == 7 && !seen[code] {
			seen[code] = true
			desc := summary.MainActivity.Description
			if cat, err := catalogs.Get(); err == nil {
				if official, ok := cat.LookupCNAE(code); ok && official.Description != "" {
					desc = official.Description
				}
			}
			items = append(items, incoming{code: code, description: desc, primary: true})
		}
	}
	for _, side := range summary.SideActivities {
		code := onlyDigits(side.Code)
		if len(code) != 7 || seen[code] {
			continue
		}
		seen[code] = true
		desc := side.Description
		if cat, err := catalogs.Get(); err == nil {
			if official, ok := cat.LookupCNAE(code); ok && official.Description != "" {
				desc = official.Description
			}
		}
		items = append(items, incoming{code: code, description: desc, primary: false})
	}
	if len(items) == 0 {
		return nil, domainerr.Validation("cnae_not_found_on_cnpj", "A Receita não retornou CNAEs para o CNPJ desta empresa")
	}

	codes := make([]string, 0, len(items))
	for _, item := range items {
		codes = append(codes, item.code)
	}

	now := time.Now().UTC()
	err = s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		for _, item := range items {
			id := ids.New()
			var desc any
			if strings.TrimSpace(item.description) != "" {
				desc = item.description
			}
			if _, err := tx.Exec(ctx, `
				insert into organization_company_cnaes (
					id, organization_id, organization_company_id, cnae_code, cnae_description,
					is_primary, enabled, source, created_at, updated_at
				) values ($1,$2,$3,$4,$5,$6,true,'receita',$7,$7)
				on conflict (organization_company_id, cnae_code) do update set
					cnae_description = excluded.cnae_description,
					is_primary = excluded.is_primary,
					source = 'receita',
					updated_at = excluded.updated_at
			`, id, organizationID, companyID, item.code, desc, item.primary, now); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `
			delete from organization_company_cnaes
			where organization_id = $1 and organization_company_id = $2
			  and not (cnae_code = any($3::varchar[]))
		`, organizationID, companyID, codes); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "company.cnaes.sync",
			ResourceType:   "organization_company_cnaes",
			ResourceID:     companyID.String(),
			After:          map[string]any{"count": len(items), "cnpj": cnpj},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.ListCompanyCNAEs(ctx, organizationID, companyID)
}

func (s *Service) companyHasCNAE(ctx context.Context, organizationID, companyID uuid.UUID, cnaeCode string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		select exists(
			select 1 from organization_company_cnaes
			where organization_id = $1 and organization_company_id = $2 and cnae_code = $3
		)
	`, organizationID, companyID, cnaeCode).Scan(&exists)
	return exists, err
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
