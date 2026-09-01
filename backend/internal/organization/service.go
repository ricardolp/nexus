package organization

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
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

func (s *Service) CreateOrganization(ctx context.Context, in CreateOrganizationInput) (*Organization, error) {
	slug, err := ValidateOrganizationInput(in)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	org := &Organization{
		ID:            ids.New(),
		LegalName:     strings.TrimSpace(in.LegalName),
		Slug:          slug,
		Status:        "active",
		Timezone:      "America/Sao_Paulo",
		DefaultLocale: "pt-BR",
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	tradeName := strings.TrimSpace(in.TradeName)
	if tradeName != "" {
		org.TradeName = &tradeName
	}
	taxIdentifier := strings.TrimSpace(in.TaxIdentifier)
	if taxIdentifier != "" {
		org.TaxIdentifier = &taxIdentifier
	}

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organizations (
				id, legal_name, trade_name, slug, tax_identifier, status, timezone, default_locale, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, org.ID, org.LegalName, org.TradeName, org.Slug, org.TaxIdentifier, org.Status, org.Timezone, org.DefaultLocale, now, now)
		if err != nil {
			return err
		}

		memberID := ids.New()
		_, err = tx.Exec(ctx, `
			insert into organization_members (id, organization_id, user_id, status, joined_at, created_by_user_id, created_at)
			values ($1,$2,$3,'active',$4,$5,$4)
		`, memberID, org.ID, in.OwnerUserID, now, in.OwnerUserID)
		if err != nil {
			return err
		}

		roleID := ids.New()
		_, err = tx.Exec(ctx, `
			insert into organization_roles (id, organization_id, name, slug, description, is_system, is_default, status, created_at, updated_at)
			values ($1,$2,'Administrador','administrador','Acesso total do tenant', true, true, 'active', $3, $3)
		`, roleID, org.ID, now)
		if err != nil {
			return err
		}

		perms := [][2]string{
			{"organization", "read"}, {"organization", "update"},
			{"member", "invite"}, {"member", "suspend"},
			{"role", "manage"}, {"company", "manage"},
			{"nfe", "read"}, {"nfe", "create"}, {"nfe", "cancel"},
			{"nfse", "read"}, {"nfse", "create"},
			{"nfe_inbound", "read"}, {"nfe_inbound", "manage"},
			{"integration", "manage"}, {"webhook", "manage"}, {"audit", "read"},
		}
		for _, p := range perms {
			_, err = tx.Exec(ctx, `
				insert into organization_permissions (id, organization_id, organization_role_id, resource, action)
				values ($1,$2,$3,$4,$5)
			`, ids.New(), org.ID, roleID, p[0], p[1])
			if err != nil {
				return err
			}
		}

		_, err = tx.Exec(ctx, `
			insert into organization_member_roles (id, organization_id, organization_member_id, organization_role_id, valid_from, created_at)
			values ($1,$2,$3,$4,$5,$5)
		`, ids.New(), org.ID, memberID, roleID, now)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			insert into organization_authentication_settings (organization_id)
			values ($1)
			on conflict (organization_id) do nothing
		`, org.ID)
		if err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &org.ID,
			ActorType:      "user",
			ActorID:        in.OwnerUserID.String(),
			Action:         "organization.create",
			ResourceType:   "organizations",
			ResourceID:     org.ID.String(),
			After:          org,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organizations_slug_key") {
			return nil, domainerr.Conflict("slug_already_exists", "Organization slug already exists")
		}
		return nil, err
	}
	return org, nil
}

func (s *Service) GetOrganization(ctx context.Context, id uuid.UUID) (*Organization, error) {
	row := s.pool.QueryRow(ctx, `
		select id, legal_name, trade_name, slug, tax_identifier, logo_url, status, timezone, default_locale, created_at, updated_at
		from organizations where id = $1
	`, id)
	var org Organization
	if err := row.Scan(&org.ID, &org.LegalName, &org.TradeName, &org.Slug, &org.TaxIdentifier, &org.LogoURL, &org.Status, &org.Timezone, &org.DefaultLocale, &org.CreatedAt, &org.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("organization_not_found", "Organization not found")
		}
		return nil, err
	}
	return &org, nil
}

func (s *Service) UpdateOrganization(ctx context.Context, in UpdateOrganizationInput) (*Organization, error) {
	legalName, err := ValidateUpdateOrganizationInput(in)
	if err != nil {
		return nil, err
	}
	var tradeName *string
	if t := strings.TrimSpace(in.TradeName); t != "" {
		tradeName = &t
	}
	var taxIdentifier *string
	if t := strings.TrimSpace(in.TaxIdentifier); t != "" {
		taxIdentifier = &t
	}
	now := time.Now().UTC()

	var org Organization
	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		row := tx.QueryRow(ctx, `
			update organizations
			set legal_name = $1, trade_name = $2, tax_identifier = $3,
			    timezone = coalesce(nullif($4, ''), timezone),
			    default_locale = coalesce(nullif($5, ''), default_locale),
			    updated_at = $6
			where id = $7
			returning id, legal_name, trade_name, slug, tax_identifier, logo_url, status, timezone, default_locale, created_at, updated_at
		`, legalName, tradeName, taxIdentifier, strings.TrimSpace(in.Timezone), strings.TrimSpace(in.DefaultLocale), now, in.OrganizationID)
		if err := row.Scan(&org.ID, &org.LegalName, &org.TradeName, &org.Slug, &org.TaxIdentifier, &org.LogoURL, &org.Status, &org.Timezone, &org.DefaultLocale, &org.CreatedAt, &org.UpdatedAt); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("organization_not_found", "Organization not found")
			}
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &org.ID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "organization.update",
			ResourceType:   "organizations",
			ResourceID:     org.ID.String(),
			After:          org,
		})
	})
	if err != nil {
		return nil, err
	}
	return &org, nil
}

// AddExistingMember links an already-registered platform user (found by
// email) to the organization as an active member — unlike InviteUser, it
// does not create a new user or send an invitation, so it only succeeds
// when the email already belongs to an existing account.
func (s *Service) AddExistingMember(ctx context.Context, in AddMemberInput) (*MemberWithUser, error) {
	normalized := strings.ToLower(strings.TrimSpace(in.Email))
	if normalized == "" {
		return nil, domainerr.Validation("invalid_email", "email is required")
	}

	var member MemberWithUser
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var userID uuid.UUID
		var email, platformRole string
		row := tx.QueryRow(ctx, `select id, email, platform_role from users where email_normalized = $1 and deleted_at is null`, normalized)
		if err := row.Scan(&userID, &email, &platformRole); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("user_not_found", "No user exists with this email — use the invite action instead")
			}
			return err
		}

		var memberID uuid.UUID
		var currentStatus string
		err := tx.QueryRow(ctx, `
			select id, status, created_at from organization_members
			where organization_id = $1 and user_id = $2
			for update
		`, in.OrganizationID, userID).Scan(&memberID, &currentStatus, &member.CreatedAt)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		now := time.Now().UTC()
		if err == nil {
			if currentStatus != "removed" {
				return domainerr.Conflict("already_member", "User is already a member of this organization")
			}
			if _, err := tx.Exec(ctx, `
				update organization_members
				set status = 'active', joined_at = $2, suspended_at = null
				where id = $1
			`, memberID, now); err != nil {
				return err
			}
			member = MemberWithUser{
				ID: memberID, UserID: userID, Email: email, PlatformRole: platformRole,
				Status: "active", JoinedAt: &now, CreatedAt: member.CreatedAt,
			}
			return audit.Write(ctx, tx, audit.Event{
				OrganizationID: &in.OrganizationID,
				ActorType:      "user",
				ActorID:        in.ActorUserID.String(),
				Action:         "member.reactivate",
				ResourceType:   "organization_members",
				ResourceID:     memberID.String(),
				After:          member,
			})
		}

		memberID = ids.New()
		if _, err := tx.Exec(ctx, `
			insert into organization_members (id, organization_id, user_id, status, joined_at, created_by_user_id, created_at)
			values ($1,$2,$3,'active',$4,$5,$4)
		`, memberID, in.OrganizationID, userID, now, in.ActorUserID); err != nil {
			return err
		}

		member = MemberWithUser{
			ID: memberID, UserID: userID, Email: email, PlatformRole: platformRole,
			Status: "active", JoinedAt: &now, CreatedAt: now,
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "member.add",
			ResourceType:   "organization_members",
			ResourceID:     memberID.String(),
			After:          member,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organization_members_organization_id_user_id_key") {
			return nil, domainerr.Conflict("already_member", "User is already a member of this organization")
		}
		return nil, err
	}
	return &member, nil
}

// RemoveMember is a soft delete of the organization membership: the
// organization_members row stays with status=removed (and the users row is
// never hard-deleted), so the person disappears from the Usuários list.
// Pending invitations for that membership are revoked. If the identity is
// still pending and has no other live membership, the user itself is also
// soft-deleted so the e-mail can be invited again.
func (s *Service) RemoveMember(ctx context.Context, in RemoveMemberInput) error {
	if in.MemberID == uuid.Nil || in.OrganizationID == uuid.Nil {
		return domainerr.Validation("invalid_member_id", "member_id is required")
	}
	if in.ActorUserID == uuid.Nil {
		return domainerr.Validation("actor_required", "actor is required")
	}

	return s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var userID uuid.UUID
		var currentStatus, email string
		row := tx.QueryRow(ctx, `
			select m.user_id, m.status, u.email
			from organization_members m
			join users u on u.id = m.user_id
			where m.id = $1 and m.organization_id = $2
			for update of m
		`, in.MemberID, in.OrganizationID)
		if err := row.Scan(&userID, &currentStatus, &email); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("member_not_found", "Member not found")
			}
			return err
		}
		if currentStatus == "removed" {
			return domainerr.NotFound("member_not_found", "Member not found")
		}
		if userID == in.ActorUserID {
			return domainerr.Validation("cannot_remove_self", "You cannot remove your own membership")
		}

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update organization_members set status = 'removed', suspended_at = null where id = $1
		`, in.MemberID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update user_invitations
			set revoked_at = $3
			where user_id = $1
			  and organization_id is not distinct from $2
			  and accepted_at is null
			  and revoked_at is null
		`, userID, in.OrganizationID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update users
			set deleted_at = $2, deleted_by_user_id = $3, status = 'disabled', updated_at = $2
			where id = $1
			  and status = 'pending'
			  and deleted_at is null
			  and not exists (
			    select 1 from organization_members
			    where user_id = $1 and status <> 'removed'
			  )
		`, userID, now, in.ActorUserID); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "member.remove",
			ResourceType:   "organization_members",
			ResourceID:     in.MemberID.String(),
			Before:         map[string]any{"user_id": userID, "email": email, "status": currentStatus},
			After:          map[string]any{"status": "removed"},
		})
	})
}

var allowedMemberStatuses = map[string]bool{"active": true, "suspended": true}

// UpdateMemberStatus toggles a member between active and suspended within
// their organization (used by the "Bloquear"/"Desbloquear" action in the
// Usuários screen). It only allows the active<->suspended transition —
// invited and removed members are managed by their own flows — and refuses
// to let an actor suspend their own membership so an org is never left
// without anyone able to undo it.
func (s *Service) UpdateMemberStatus(ctx context.Context, in UpdateMemberStatusInput) (*MemberWithUser, error) {
	if !allowedMemberStatuses[in.Status] {
		return nil, domainerr.Validation("invalid_status", "status must be 'active' or 'suspended'")
	}

	var member MemberWithUser
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var userID uuid.UUID
		var currentStatus string
		row := tx.QueryRow(ctx, `
			select user_id, status from organization_members
			where id = $1 and organization_id = $2
			for update
		`, in.MemberID, in.OrganizationID)
		if err := row.Scan(&userID, &currentStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("member_not_found", "Member not found")
			}
			return err
		}
		if currentStatus != "active" && currentStatus != "suspended" {
			return domainerr.Conflict("invalid_member_status", "Only active or suspended members can change status this way")
		}
		if userID == in.ActorUserID && in.Status == "suspended" {
			return domainerr.Validation("cannot_suspend_self", "You cannot suspend your own membership")
		}

		now := time.Now().UTC()
		var suspendedAt *time.Time
		if in.Status == "suspended" {
			suspendedAt = &now
		}
		if _, err := tx.Exec(ctx, `
			update organization_members set status = $1, suspended_at = $2 where id = $3
		`, in.Status, suspendedAt, in.MemberID); err != nil {
			return err
		}

		row = tx.QueryRow(ctx, `
			select m.id, m.user_id, u.email, u.platform_role, m.status, m.joined_at, m.created_at
			from organization_members m
			join users u on u.id = m.user_id
			where m.id = $1
		`, in.MemberID)
		if err := row.Scan(&member.ID, &member.UserID, &member.Email, &member.PlatformRole, &member.Status, &member.JoinedAt, &member.CreatedAt); err != nil {
			return err
		}

		action := "member.suspend"
		if in.Status == "active" {
			action = "member.reactivate"
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         action,
			ResourceType:   "organization_members",
			ResourceID:     in.MemberID.String(),
			After:          member,
		})
	})
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func (s *Service) ListOrganizations(ctx context.Context) ([]Organization, error) {
	rows, err := s.pool.Query(ctx, `
		select id, legal_name, trade_name, slug, tax_identifier, logo_url, status, timezone, default_locale, created_at, updated_at
		from organizations
		order by created_at desc
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Organization
	for rows.Next() {
		var org Organization
		if err := rows.Scan(&org.ID, &org.LegalName, &org.TradeName, &org.Slug, &org.TaxIdentifier, &org.LogoURL, &org.Status, &org.Timezone, &org.DefaultLocale, &org.CreatedAt, &org.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, org)
	}
	return out, nil
}

func (s *Service) ListOrganizationsUsage(ctx context.Context) ([]OrganizationUsage, error) {
	rows, err := s.pool.Query(ctx, `
		select
			o.id, o.legal_name, o.slug, o.status,
			count(distinct c.id) as companies_count,
			count(distinct m.id) filter (where m.status = 'active') as members_count,
			count(distinct d.id) as documents_count,
			count(distinct d.id) filter (where d.created_at >= now() - interval '24 hours') as documents_last_24h,
			(
				(select count(*) from organization_document_attempts a
				 where a.organization_id = o.id and a.error_code is not null
				   and a.created_at >= now() - interval '24 hours')
				+
				(select count(*) from organization_execution_plan_steps s
				 where s.organization_id = o.id and s.error_code is not null
				   and coalesce(s.finished_at, s.updated_at) >= now() - interval '24 hours')
				+
				(select count(*) from organization_company_nfe_distribution_polls p
				 where p.organization_id = o.id and p.outcome = 'error'
				   and p.created_at >= now() - interval '24 hours')
			) as errors_last_24h,
			(select count(*) from organization_company_nfe_distribution_state st
			 where st.organization_id = o.id and st.status = 'error') as distribution_error_companies
		from organizations o
		left join organization_companies c on c.organization_id = o.id
		left join organization_members m on m.organization_id = o.id
		left join organization_documents d on d.organization_id = o.id
		group by o.id, o.legal_name, o.slug, o.status
		order by o.legal_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []OrganizationUsage
	for rows.Next() {
		var u OrganizationUsage
		if err := rows.Scan(
			&u.OrganizationID, &u.LegalName, &u.Slug, &u.Status,
			&u.CompaniesCount, &u.MembersCount, &u.DocumentsCount,
			&u.DocumentsLast24h, &u.ErrorsLast24h, &u.DistributionErrorCompanies,
		); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, nil
}

func (s *Service) CreateCompany(ctx context.Context, in CreateCompanyInput) (*Company, error) {
	cnpj, env, uf, err := ValidateCompanyInput(in)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	company := &Company{
		ID:             ids.New(),
		OrganizationID: in.OrganizationID,
		LegalName:      strings.TrimSpace(in.LegalName),
		CNPJ:           cnpj,
		Environment:    env,
		Status:         "active",
		MetadataJSON:   json.RawMessage(`{}`),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	tradeName := strings.TrimSpace(in.TradeName)
	if tradeName != "" {
		company.TradeName = &tradeName
	}
	if uf != "" {
		company.UF = &uf
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_companies (
				id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		`, company.ID, company.OrganizationID, company.LegalName, company.TradeName, company.CNPJ, company.UF, company.Environment, company.Status, company.MetadataJSON, now, now)
		if err != nil {
			return err
		}

		// Ativa serviços padrão outbound/inbound nfe e nfse.
		rows, err := tx.Query(ctx, `select id from services where code in ('nfe_outbound','nfse_outbound','nfe_inbound','nfse_inbound') and status = 'active'`)
		if err != nil {
			return err
		}
		serviceIDs, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
		if err != nil {
			return err
		}
		for _, serviceID := range serviceIDs {
			_, err = tx.Exec(ctx, `
				insert into organization_company_services (
					id, organization_id, organization_company_id, service_id, status, activated_at, created_at
				) values ($1,$2,$3,$4,'active',$5,$5)
			`, ids.New(), in.OrganizationID, company.ID, serviceID, now)
			if err != nil {
				return err
			}
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "company.create",
			ResourceType:   "organization_companies",
			ResourceID:     company.ID.String(),
			After:          company,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organization_companies_organization_id_cnpj_key") {
			return nil, domainerr.Conflict("cnpj_already_exists", "CNPJ already registered for this organization")
		}
		return nil, err
	}
	return company, nil
}

func (s *Service) ListCompanies(ctx context.Context, organizationID uuid.UUID) ([]Company, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
		from organization_companies
		where organization_id = $1
		order by created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Company
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID, &c.OrganizationID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.UF, &c.Environment, &c.Status, &c.MetadataJSON, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

var allowedCompanyStatuses = map[string]bool{"active": true, "disabled": true}

// UpdateCompanyStatus toggles a company between active and disabled within
// its organization (used by the "Ativar"/"Desativar" action in the Empresas
// screen). "suspended" is a separate, system-driven state (e.g. billing) and
// is not reachable through this transition.
func (s *Service) UpdateCompanyStatus(ctx context.Context, in UpdateCompanyStatusInput) (*Company, error) {
	if !allowedCompanyStatuses[in.Status] {
		return nil, domainerr.Validation("invalid_status", "status must be 'active' or 'disabled'")
	}

	var company Company
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var currentStatus string
		row := tx.QueryRow(ctx, `
			select status from organization_companies
			where id = $1 and organization_id = $2
			for update
		`, in.CompanyID, in.OrganizationID)
		if err := row.Scan(&currentStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("company_not_found", "Company not found")
			}
			return err
		}
		if currentStatus != "active" && currentStatus != "disabled" {
			return domainerr.Conflict("invalid_company_status", "Only active or disabled companies can change status this way")
		}

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update organization_companies set status = $1, updated_at = $2 where id = $3
		`, in.Status, now, in.CompanyID); err != nil {
			return err
		}

		row = tx.QueryRow(ctx, `
			select id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
			from organization_companies
			where id = $1
		`, in.CompanyID)
		if err := row.Scan(&company.ID, &company.OrganizationID, &company.LegalName, &company.TradeName, &company.CNPJ, &company.UF, &company.Environment, &company.Status, &company.MetadataJSON, &company.CreatedAt, &company.UpdatedAt); err != nil {
			return err
		}

		action := "company.disable"
		if in.Status == "active" {
			action = "company.activate"
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         action,
			ResourceType:   "organization_companies",
			ResourceID:     in.CompanyID.String(),
			After:          company,
		})
	})
	if err != nil {
		return nil, err
	}
	return &company, nil
}

// UpdateCompanyDetails edits cadastral fields (legal_name, trade_name, uf,
// environment) — see UpdateCompanyDetailsInput for why CNPJ and status are
// out of scope here. Used by the "Editar" action in the Empresas screen,
// notably to let an operator set uf on a company that predates the field
// (see docs/architecture/22_nfe_gateway_service.md, "Ambiente de
// homologação") without having to recreate the company.
func (s *Service) UpdateCompanyDetails(ctx context.Context, in UpdateCompanyDetailsInput) (*Company, error) {
	legalName, uf, environment, err := ValidateUpdateCompanyInput(in)
	if err != nil {
		return nil, err
	}

	var company Company
	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var exists bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
		`, in.CompanyID, in.OrganizationID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return domainerr.NotFound("company_not_found", "Company not found")
		}

		var tradeNamePtr, ufPtr *string
		if tradeName := strings.TrimSpace(in.TradeName); tradeName != "" {
			tradeNamePtr = &tradeName
		}
		if uf != "" {
			ufPtr = &uf
		}

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update organization_companies
			set legal_name = $1, trade_name = $2, uf = $3, environment = $4, updated_at = $5
			where id = $6
		`, legalName, tradeNamePtr, ufPtr, environment, now, in.CompanyID); err != nil {
			return err
		}

		row := tx.QueryRow(ctx, `
			select id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
			from organization_companies
			where id = $1
		`, in.CompanyID)
		if err := row.Scan(&company.ID, &company.OrganizationID, &company.LegalName, &company.TradeName, &company.CNPJ, &company.UF, &company.Environment, &company.Status, &company.MetadataJSON, &company.CreatedAt, &company.UpdatedAt); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "company.update",
			ResourceType:   "organization_companies",
			ResourceID:     in.CompanyID.String(),
			After:          company,
		})
	})
	if err != nil {
		return nil, err
	}
	return &company, nil
}

// ListCompanyServices returns the full active service catalog joined with
// this company's activation state — every catalog service is represented
// even if the company has never activated it (status "disabled").
func (s *Service) ListCompanyServices(ctx context.Context, organizationID, companyID uuid.UUID) ([]CompanyService, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
	`, companyID, organizationID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, domainerr.NotFound("company_not_found", "Company not found")
	}

	rows, err := s.pool.Query(ctx, `
		select svc.id, svc.code, svc.name,
		       coalesce(ocs.status, 'disabled') as status,
		       ocs.activated_at, ocs.deactivated_at
		from services svc
		left join organization_company_services ocs
			on ocs.service_id = svc.id and ocs.organization_company_id = $1
		where svc.status = 'active'
		order by svc.code
	`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CompanyService
	for rows.Next() {
		var cs CompanyService
		if err := rows.Scan(&cs.ServiceID, &cs.ServiceCode, &cs.ServiceName, &cs.Status, &cs.ActivatedAt, &cs.DeactivatedAt); err != nil {
			return nil, err
		}
		out = append(out, cs)
	}
	return out, nil
}

var allowedCompanyServiceStatuses = map[string]bool{"active": true, "disabled": true}

// UpdateCompanyServiceStatus activates or deactivates a single catalog
// service (e.g. nfe_inbound/nfe_outbound) for a company, upserting the
// organization_company_services row since a service may never have been
// activated before. activated_at/deactivated_at are only touched on the
// side matching the new status, preserving prior history on the other side.
func (s *Service) UpdateCompanyServiceStatus(ctx context.Context, in UpdateCompanyServiceStatusInput) (*CompanyService, error) {
	if !allowedCompanyServiceStatuses[in.Status] {
		return nil, domainerr.Validation("invalid_status", "status must be 'active' or 'disabled'")
	}

	var result CompanyService
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var companyExists bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
		`, in.CompanyID, in.OrganizationID).Scan(&companyExists); err != nil {
			return err
		}
		if !companyExists {
			return domainerr.NotFound("company_not_found", "Company not found")
		}

		row := tx.QueryRow(ctx, `select code, name from services where id = $1 and status = 'active'`, in.ServiceID)
		if err := row.Scan(&result.ServiceCode, &result.ServiceName); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("service_not_found", "Service not found")
			}
			return err
		}

		now := time.Now().UTC()
		var activatedAt, deactivatedAt *time.Time
		if in.Status == "active" {
			activatedAt = &now
		} else {
			deactivatedAt = &now
		}

		err := tx.QueryRow(ctx, `
			insert into organization_company_services (
				id, organization_id, organization_company_id, service_id, status, activated_at, deactivated_at, created_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
			on conflict (organization_company_id, service_id) do update
				set status = excluded.status,
					activated_at = case when excluded.status = 'active' then excluded.activated_at else organization_company_services.activated_at end,
					deactivated_at = case when excluded.status = 'disabled' then excluded.deactivated_at else organization_company_services.deactivated_at end
			returning status, activated_at, deactivated_at
		`, ids.New(), in.OrganizationID, in.CompanyID, in.ServiceID, in.Status, activatedAt, deactivatedAt, now).
			Scan(&result.Status, &result.ActivatedAt, &result.DeactivatedAt)
		if err != nil {
			return err
		}
		result.ServiceID = in.ServiceID

		action := "company_service.disable"
		if in.Status == "active" {
			action = "company_service.activate"
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         action,
			ResourceType:   "organization_company_services",
			ResourceID:     in.CompanyID.String() + ":" + result.ServiceCode,
			After:          result,
		})
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) GetCompany(ctx context.Context, organizationID, companyID uuid.UUID) (*Company, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
		from organization_companies
		where organization_id = $1 and id = $2
	`, organizationID, companyID)
	var c Company
	if err := row.Scan(&c.ID, &c.OrganizationID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.UF, &c.Environment, &c.Status, &c.MetadataJSON, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("company_not_found", "Company not found")
		}
		return nil, err
	}
	return &c, nil
}

func (s *Service) GetCompanyByCNPJ(ctx context.Context, organizationID uuid.UUID, cnpj string) (*Company, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, legal_name, trade_name, cnpj, uf, environment, status, metadata_json, created_at, updated_at
		from organization_companies
		where organization_id = $1 and cnpj = $2
	`, organizationID, NormalizeCNPJ(cnpj))
	var c Company
	if err := row.Scan(&c.ID, &c.OrganizationID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.UF, &c.Environment, &c.Status, &c.MetadataJSON, &c.CreatedAt, &c.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.Validation("company_not_found", "No company registered for this organization with the given CNPJ")
		}
		return nil, err
	}
	return &c, nil
}

func (s *Service) EnsureMember(ctx context.Context, organizationID, userID uuid.UUID) error {
	var status string
	err := s.pool.QueryRow(ctx, `
		select status from organization_members where organization_id = $1 and user_id = $2
	`, organizationID, userID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return domainerr.Forbidden("User is not a member of this organization")
	}
	if err != nil {
		return err
	}
	if status != "active" {
		return domainerr.Forbidden("Membership is not active")
	}
	return nil
}

func (s *Service) ResolveUserOrganization(ctx context.Context, userID uuid.UUID) (uuid.UUID, error) {
	var organizationID uuid.UUID
	err := s.pool.QueryRow(ctx, `
		select m.organization_id
		from organization_members m
		join organizations o on o.id = m.organization_id
		where m.user_id = $1
		  and m.status = 'active'
		  and o.status = 'active'
		order by m.joined_at nulls last, m.created_at, m.organization_id
		limit 1
	`, userID).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, domainerr.Forbidden("User has no active organization membership")
	}
	if err != nil {
		return uuid.Nil, err
	}
	return organizationID, nil
}

func (s *Service) EnsureActiveOrganization(ctx context.Context, organizationID uuid.UUID) error {
	var active bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organizations where id = $1 and status = 'active')
	`, organizationID).Scan(&active); err != nil {
		return err
	}
	if !active {
		return domainerr.Validation("invalid_organization_id", "organization_id must reference an active organization")
	}
	return nil
}

func (s *Service) CreateAPIClient(ctx context.Context, in CreateAPIClientInput) (*CreatedAPIClient, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, domainerr.Validation("invalid_api_client", "name is required")
	}
	if len(name) > 200 {
		return nil, domainerr.Validation("invalid_api_client", "name must contain at most 200 characters")
	}
	sourceSystem := strings.TrimSpace(in.SourceSystem)
	if sourceSystem == "" {
		return nil, domainerr.Validation("invalid_api_client", "source_system is required")
	}
	if len(sourceSystem) > 120 {
		return nil, domainerr.Validation("invalid_api_client", "source_system must contain at most 120 characters")
	}
	scopes, err := NormalizeAPIClientScopes(in.Scopes)
	if err != nil {
		return nil, err
	}

	issuedOrgToken := ""
	if strings.TrimSpace(in.LegacyOrgToken) == "" && in.GenerateOrgToken {
		generated, genErr := generateInboundOrgToken()
		if genErr != nil {
			return nil, genErr
		}
		in.LegacyOrgToken = generated
		issuedOrgToken = generated
	}

	legacyHash, err := hashLegacyOrgToken(in.LegacyOrgToken)
	if err != nil {
		return nil, err
	}

	secret, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	secretHash := crypto.HashToken(secret)
	clientID := "fm_" + strings.ReplaceAll(ids.New().String(), "-", "")[:20]
	now := time.Now().UTC()
	hint := tokenHint(in.LegacyOrgToken)

	client := APIClient{
		ID:                ids.New(),
		OrganizationID:    in.OrganizationID,
		Name:              name,
		ClientID:          clientID,
		SourceSystem:      sourceSystem,
		Status:            "active",
		HasLegacyOrgToken: legacyHash != nil,
		TokenHint:         hint,
		Scopes:            scopes,
		CreatedAt:         now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_api_clients (id, organization_id, name, client_id, source_system, status, legacy_org_token_hash, token_hint, created_at, updated_at)
			values ($1,$2,$3,$4,$5,'active',$6,$7,$8,$8)
		`, client.ID, client.OrganizationID, client.Name, client.ClientID, client.SourceSystem, legacyHash, hint, now)
		if err != nil {
			return mapLegacyOrgTokenConflict(err)
		}
		_, err = tx.Exec(ctx, `
			insert into organization_api_client_credentials (
				id, organization_id, organization_api_client_id, client_secret_hash, secret_hint, status, created_at
			) values ($1,$2,$3,$4,$5,'active',$6)
		`, ids.New(), in.OrganizationID, client.ID, secretHash, secret[len(secret)-4:], now)
		if err != nil {
			return err
		}
		for _, scope := range scopes {
			_, err = tx.Exec(ctx, `
				insert into organization_api_client_scopes (id, organization_id, organization_api_client_id, scope)
				values ($1,$2,$3,$4)
			`, ids.New(), in.OrganizationID, client.ID, scope)
			if err != nil {
				return err
			}
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "api_client.create",
			ResourceType:   "organization_api_clients",
			ResourceID:     client.ID.String(),
			After:          map[string]any{"client_id": client.ClientID, "name": client.Name, "source_system": client.SourceSystem, "scopes": scopes},
		})
	})
	if err != nil {
		return nil, err
	}

	return &CreatedAPIClient{Client: client, ClientSecret: secret, OrgToken: issuedOrgToken}, nil
}

func (s *Service) ListAPIClients(ctx context.Context, organizationID uuid.UUID) ([]APIClient, error) {
	rows, err := s.pool.Query(ctx, `
		select c.id, c.organization_id, c.name, c.client_id, c.source_system, c.status,
		       c.legacy_org_token_hash is not null, c.token_hint, c.last_used_at, c.request_count, c.created_at,
		       cred.secret_hint
		from organization_api_clients c
		left join lateral (
			select secret_hint
			from organization_api_client_credentials
			where organization_api_client_id = c.id and status = 'active'
			order by created_at desc
			limit 1
		) cred on true
		where c.organization_id = $1
		order by c.created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]APIClient, 0)
	index := make(map[uuid.UUID]int)
	for rows.Next() {
		var c APIClient
		if err := rows.Scan(
			&c.ID, &c.OrganizationID, &c.Name, &c.ClientID, &c.SourceSystem, &c.Status,
			&c.HasLegacyOrgToken, &c.TokenHint, &c.LastUsedAt, &c.RequestCount, &c.CreatedAt,
			&c.SecretHint,
		); err != nil {
			return nil, err
		}
		c.Scopes = []string{}
		index[c.ID] = len(out)
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	scopeRows, err := s.pool.Query(ctx, `
		select organization_api_client_id, scope
		from organization_api_client_scopes
		where organization_id = $1
		order by scope
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer scopeRows.Close()
	for scopeRows.Next() {
		var clientID uuid.UUID
		var scope string
		if err := scopeRows.Scan(&clientID, &scope); err != nil {
			return nil, err
		}
		i, ok := index[clientID]
		if !ok {
			continue
		}
		out[i].Scopes = append(out[i].Scopes, scope)
	}
	return out, scopeRows.Err()
}

func (s *Service) SetLegacyOrgToken(ctx context.Context, in SetLegacyOrgTokenInput) error {
	legacyHash, err := hashLegacyOrgToken(in.OrgToken)
	if err != nil {
		return err
	}
	if legacyHash == nil {
		return domainerr.Validation("invalid_org_token", "org_token is required")
	}

	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_api_clients
			set legacy_org_token_hash = $3, token_hint = $4, updated_at = now()
			where id = $1 and organization_id = $2 and status = 'active'
		`, in.APIClientID, in.OrganizationID, *legacyHash, tokenHint(in.OrgToken))
		if err != nil {
			return mapLegacyOrgTokenConflict(err)
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("api_client_not_found", "API client not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "api_client.legacy_org_token.set",
			ResourceType:   "organization_api_clients",
			ResourceID:     in.APIClientID.String(),
		})
	})
}

func (s *Service) RotateInboundToken(ctx context.Context, in RotateInboundTokenInput) (*RotatedInboundToken, error) {
	token, err := generateInboundOrgToken()
	if err != nil {
		return nil, err
	}
	if err := s.SetLegacyOrgToken(ctx, SetLegacyOrgTokenInput{
		OrganizationID: in.OrganizationID,
		APIClientID:    in.APIClientID,
		OrgToken:       token,
		ActorUserID:    in.ActorUserID,
	}); err != nil {
		return nil, err
	}
	hint := ""
	if h := tokenHint(token); h != nil {
		hint = *h
	}
	return &RotatedInboundToken{OrgToken: token, TokenHint: hint, HasLegacyOrgToken: true}, nil
}

func (s *Service) RevokeAPIClient(ctx context.Context, in RevokeAPIClientInput) error {
	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organization_api_clients
			set status = 'revoked', updated_at = now()
			where id = $1 and organization_id = $2 and status <> 'revoked'
		`, in.APIClientID, in.OrganizationID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("api_client_not_found", "API client not found")
		}
		if _, err := tx.Exec(ctx, `
			update organization_api_client_credentials
			set status = 'revoked', revoked_at = now()
			where organization_api_client_id = $1 and organization_id = $2 and status = 'active'
		`, in.APIClientID, in.OrganizationID); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "api_client.revoke",
			ResourceType:   "organization_api_clients",
			ResourceID:     in.APIClientID.String(),
		})
	})
}

func (s *Service) AuthenticateByLegacyOrgToken(ctx context.Context, orgToken string) (*AuthenticatedClient, error) {
	token := strings.TrimSpace(orgToken)
	if token == "" {
		return nil, domainerr.Unauthorized("Invalid organization token")
	}
	tokenHash := crypto.HashToken(token)
	lockKey := "org_token:" + tokenHash

	locked, err := s.isAuthLocked(ctx, lockKey)
	if err != nil {
		return nil, err
	}
	if locked {
		return nil, domainerr.TooManyRequests("Too many failed authentication attempts for this client — try again later")
	}

	row := s.pool.QueryRow(ctx, `
		select c.organization_id, c.client_id, c.source_system
		from organization_api_clients c
		where c.legacy_org_token_hash = $1 and c.status = 'active'
		limit 1
	`, tokenHash)

	var orgID uuid.UUID
	var storedClientID, sourceSystem string
	if err := row.Scan(&orgID, &storedClientID, &sourceSystem); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.recordFailedAuthAttempt(ctx, lockKey)
			return nil, domainerr.Unauthorized("Invalid organization token")
		}
		return nil, err
	}
	s.resetAuthAttempts(ctx, lockKey)
	s.touchAPIClientUsage(ctx, storedClientID)

	rows, err := s.pool.Query(ctx, `
		select scope from organization_api_client_scopes s
		join organization_api_clients c on c.id = s.organization_api_client_id
		where c.client_id = $1
	`, storedClientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scopes []string
	for rows.Next() {
		var scope string
		if err := rows.Scan(&scope); err != nil {
			return nil, err
		}
		scopes = append(scopes, scope)
	}

	return &AuthenticatedClient{OrganizationID: orgID, ClientID: storedClientID, SourceSystem: sourceSystem, Scopes: scopes}, nil
}

func hashLegacyOrgToken(raw string) (*string, error) {
	token := strings.TrimSpace(raw)
	if token == "" {
		return nil, nil
	}
	if len(token) < 16 {
		return nil, domainerr.Validation("invalid_org_token", "org_token must contain at least 16 characters")
	}
	if len(token) > 255 {
		return nil, domainerr.Validation("invalid_org_token", "org_token must contain at most 255 characters")
	}
	hash := crypto.HashToken(token)
	return &hash, nil
}

func generateInboundOrgToken() (string, error) {
	raw, err := crypto.RandomToken(24)
	if err != nil {
		return "", err
	}
	return "nx_" + raw, nil
}

func tokenHint(raw string) *string {
	token := strings.TrimSpace(raw)
	if len(token) < 4 {
		return nil
	}
	hint := token[len(token)-4:]
	return &hint
}

func (s *Service) touchAPIClientUsage(ctx context.Context, clientID string) {
	_, _ = s.pool.Exec(ctx, `
		update organization_api_clients
		set last_used_at = now(), request_count = request_count + 1, updated_at = now()
		where client_id = $1 and status = 'active'
	`, clientID)
}

func mapLegacyOrgTokenConflict(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return domainerr.Conflict("org_token_in_use", "This org token is already assigned to an API client")
	}
	return err
}

// GetNFeDistributionState returns the current NSU cursor/status for a
// company's inbound distribution, or nil if it was never activated (no row
// yet — see docs/architecture/22_nfe_gateway_service.md, "Ativação").
func (s *Service) GetNFeDistributionState(ctx context.Context, organizationCompanyID uuid.UUID) (*NFeDistributionState, error) {
	row := s.pool.QueryRow(ctx, `
		select organization_company_id, status, last_nsu, max_nsu, poll_interval_seconds,
		       consecutive_empty_polls, consecutive_errors, last_cstat, last_message,
		       last_poll_at, last_success_at, next_allowed_poll_at
		from organization_company_nfe_distribution_state
		where organization_company_id = $1
	`, organizationCompanyID)
	var st NFeDistributionState
	err := row.Scan(
		&st.OrganizationCompanyID, &st.Status, &st.LastNSU, &st.MaxNSU, &st.PollIntervalSeconds,
		&st.ConsecutiveEmptyPolls, &st.ConsecutiveErrors, &st.LastCstat, &st.LastMessage,
		&st.LastPollAt, &st.LastSuccessAt, &st.NextAllowedPollAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &st, nil
}

// ListNFeDistributionPolls returns the most recent SEFAZ distribution
// attempts for a company, newest first — the audit/governance log an admin
// browses (idx_nfe_distribution_polls_company already covers this query).
func (s *Service) ListNFeDistributionPolls(ctx context.Context, organizationCompanyID uuid.UUID, limit int) ([]NFeDistributionPoll, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		select id, organization_company_id, requested_nsu, ult_nsu, max_nsu, cstat, xmotivo,
		       documents_found, documents_ingested, documents_summary_only, outcome, error_message,
		       started_at, finished_at
		from organization_company_nfe_distribution_polls
		where organization_company_id = $1
		order by started_at desc
		limit $2
	`, organizationCompanyID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NFeDistributionPoll
	for rows.Next() {
		var p NFeDistributionPoll
		if err := rows.Scan(
			&p.ID, &p.OrganizationCompanyID, &p.RequestedNSU, &p.UltNSU, &p.MaxNSU, &p.Cstat, &p.Xmotivo,
			&p.DocumentsFound, &p.DocumentsIngested, &p.DocumentsSummaryOnly, &p.Outcome, &p.ErrorMessage,
			&p.StartedAt, &p.FinishedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Service) ListMembers(ctx context.Context, organizationID uuid.UUID) ([]MemberWithUser, error) {
	rows, err := s.pool.Query(ctx, `
		select m.id, m.user_id, u.email, u.platform_role, m.status, m.joined_at, m.created_at, i.expires_at, u.last_login_at
		from organization_members m
		join users u on u.id = m.user_id
		left join user_invitations i
		  on i.user_id = m.user_id
		 and i.organization_id is not distinct from m.organization_id
		 and i.accepted_at is null
		 and i.revoked_at is null
		where m.organization_id = $1
		  and m.status <> 'removed'
		  and u.deleted_at is null
		order by m.created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MemberWithUser
	for rows.Next() {
		var m MemberWithUser
		if err := rows.Scan(&m.ID, &m.UserID, &m.Email, &m.PlatformRole, &m.Status, &m.JoinedAt, &m.CreatedAt, &m.InvitationExpiresAt, &m.LastLoginAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func (s *Service) GetMember(ctx context.Context, organizationID, memberID uuid.UUID) (*MemberWithUser, error) {
	var m MemberWithUser
	err := s.pool.QueryRow(ctx, `
		select m.id, m.user_id, u.email, u.platform_role, m.status, m.joined_at, m.created_at, u.last_login_at
		from organization_members m
		join users u on u.id = m.user_id
		where m.id = $1
		  and m.organization_id = $2
		  and m.status <> 'removed'
		  and u.deleted_at is null
	`, memberID, organizationID).Scan(
		&m.ID, &m.UserID, &m.Email, &m.PlatformRole, &m.Status, &m.JoinedAt, &m.CreatedAt, &m.LastLoginAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("member_not_found", "Member not found")
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// authLockoutWindow/authLockoutMaxAttempts/authLockoutDuration bound
// POST /v1/oauth/token — defense in depth, not the primary protection
// (client_secret is a 256-bit crypto.RandomToken(32), so online brute force
// isn't practically viable). Values chosen generously enough that a
// legitimate integrator hitting a transient wrong-secret bug once or twice
// never gets locked out.
const (
	authLockoutWindow      = 15 * time.Minute
	authLockoutMaxAttempts = 10
	authLockoutDuration    = 15 * time.Minute
)

func (s *Service) AuthenticateAPIClient(ctx context.Context, clientID, clientSecret string) (*AuthenticatedClient, error) {
	locked, err := s.isAuthLocked(ctx, clientID)
	if err != nil {
		return nil, err
	}
	if locked {
		return nil, domainerr.TooManyRequests("Too many failed authentication attempts for this client — try again later")
	}

	row := s.pool.QueryRow(ctx, `
		select c.organization_id, c.client_id, c.source_system, cred.client_secret_hash
		from organization_api_clients c
		join organization_api_client_credentials cred on cred.organization_api_client_id = c.id
		where c.client_id = $1 and c.status = 'active' and cred.status = 'active'
		order by cred.created_at desc
		limit 1
	`, clientID)

	var orgID uuid.UUID
	var storedClientID, sourceSystem, secretHash string
	if err := row.Scan(&orgID, &storedClientID, &sourceSystem, &secretHash); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			s.recordFailedAuthAttempt(ctx, clientID)
			return nil, domainerr.Unauthorized("Invalid client credentials")
		}
		return nil, err
	}
	if crypto.HashToken(clientSecret) != secretHash {
		s.recordFailedAuthAttempt(ctx, clientID)
		return nil, domainerr.Unauthorized("Invalid client credentials")
	}
	s.resetAuthAttempts(ctx, clientID)
	s.touchAPIClientUsage(ctx, storedClientID)

	rows, err := s.pool.Query(ctx, `
		select scope from organization_api_client_scopes s
		join organization_api_clients c on c.id = s.organization_api_client_id
		where c.client_id = $1
	`, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var scopes []string
	for rows.Next() {
		var scope string
		if err := rows.Scan(&scope); err != nil {
			return nil, err
		}
		scopes = append(scopes, scope)
	}

	// Every issued client-credentials token is audited — this is the one
	// place a technical integration (SAP, nfe-gateway, ...) proves who it
	// is. Best-effort on purpose: unlike certificate.signing_material_
	// accessed this doesn't gate on anything sensitive being returned, so
	// an audit outage must not become an availability outage for every
	// integration's token requests.
	_ = s.pool.WithTenant(ctx, orgID, func(ctx context.Context, tx pgx.Tx) error {
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &orgID,
			ActorType:      "api_client",
			ActorID:        storedClientID,
			Action:         "api_client.token_issued",
			ResourceType:   "organization_api_clients",
			ResourceID:     storedClientID,
			After:          map[string]any{"source_system": sourceSystem, "scopes": scopes},
		})
	})

	return &AuthenticatedClient{OrganizationID: orgID, ClientID: storedClientID, SourceSystem: sourceSystem, Scopes: scopes}, nil
}

func (s *Service) isAuthLocked(ctx context.Context, clientID string) (bool, error) {
	var lockedUntil *time.Time
	err := s.pool.QueryRow(ctx, `
		select locked_until from organization_api_client_auth_attempts where client_id = $1
	`, clientID).Scan(&lockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return lockedUntil != nil && lockedUntil.After(time.Now().UTC()), nil
}

// recordFailedAuthAttempt is best-effort: a failure tracking a failure must
// never itself fail the caller's request, so errors here are swallowed
// (this is defense in depth, not the primary auth boundary — see the
// authLockout* constants above `AuthenticateAPIClient`).
func (s *Service) recordFailedAuthAttempt(ctx context.Context, clientID string) {
	now := time.Now().UTC()
	windowStart := now.Add(-authLockoutWindow)
	var failedCount int
	err := s.pool.QueryRow(ctx, `
		insert into organization_api_client_auth_attempts (client_id, failed_count, window_started_at)
		values ($1, 1, $2)
		on conflict (client_id) do update set
			failed_count = case when organization_api_client_auth_attempts.window_started_at < $3
			                     then 1
			                     else organization_api_client_auth_attempts.failed_count + 1 end,
			window_started_at = case when organization_api_client_auth_attempts.window_started_at < $3
			                          then $2
			                          else organization_api_client_auth_attempts.window_started_at end
		returning failed_count
	`, clientID, now, windowStart).Scan(&failedCount)
	if err != nil {
		return
	}
	if failedCount >= authLockoutMaxAttempts {
		_, _ = s.pool.Exec(ctx, `
			update organization_api_client_auth_attempts set locked_until = $2 where client_id = $1
		`, clientID, now.Add(authLockoutDuration))
	}
}

func (s *Service) resetAuthAttempts(ctx context.Context, clientID string) {
	_, _ = s.pool.Exec(ctx, `delete from organization_api_client_auth_attempts where client_id = $1`, clientID)
}

func (s *Service) HasCompanyService(ctx context.Context, organizationID, companyID uuid.UUID, serviceCode string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		select exists(
			select 1
			from organization_company_services ocs
			join services svc on svc.id = ocs.service_id
			where ocs.organization_id = $1
			  and ocs.organization_company_id = $2
			  and ocs.status = 'active'
			  and svc.code = $3
			  and svc.status = 'active'
		)
	`, organizationID, companyID, serviceCode).Scan(&exists)
	return exists, err
}
