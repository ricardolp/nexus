package organization

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

func (s *Service) CreateRole(ctx context.Context, in CreateRoleInput) (*RoleWithPermissions, error) {
	name, slug, description, permissions, err := ValidateRoleInput(in)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	role := Role{
		ID:             ids.New(),
		OrganizationID: in.OrganizationID,
		Name:           name,
		Slug:           slug,
		Description:    description,
		Status:         "active",
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_roles (
				id, organization_id, name, slug, description, is_system, is_default, status, created_at, updated_at
			) values ($1,$2,$3,$4,$5,false,false,'active',$6,$6)
		`, role.ID, role.OrganizationID, role.Name, role.Slug, role.Description, now)
		if err != nil {
			return err
		}
		if err := insertRolePermissions(ctx, tx, in.OrganizationID, role.ID, permissions); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "role.create",
			ResourceType:   "organization_roles",
			ResourceID:     role.ID.String(),
			After:          map[string]any{"name": role.Name, "slug": role.Slug, "permissions": permissions},
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organization_roles_organization_id_slug_key") {
			return nil, domainerr.Conflict("slug_already_exists", "A role with this slug already exists in this organization")
		}
		return nil, err
	}
	return &RoleWithPermissions{Role: role, Permissions: permissions}, nil
}

func (s *Service) UpdateRole(ctx context.Context, in UpdateRoleInput) (*RoleWithPermissions, error) {
	name, description, permissions, err := ValidateUpdateRoleInput(in)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	var role Role
	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var isSystem bool
		if err := tx.QueryRow(ctx, `
			select is_system from organization_roles where id = $1 and organization_id = $2 for update
		`, in.RoleID, in.OrganizationID).Scan(&isSystem); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("role_not_found", "Role not found")
			}
			return err
		}
		if isSystem {
			return domainerr.Forbidden("System roles cannot be modified")
		}

		row := tx.QueryRow(ctx, `
			update organization_roles
			set name = $1, description = $2, updated_at = $3
			where id = $4
			returning id, organization_id, name, slug, description, is_system, is_default, status, created_at, updated_at
		`, name, description, now, in.RoleID)
		if err := row.Scan(
			&role.ID, &role.OrganizationID, &role.Name, &role.Slug, &role.Description,
			&role.IsSystem, &role.IsDefault, &role.Status, &role.CreatedAt, &role.UpdatedAt,
		); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `delete from organization_permissions where organization_role_id = $1`, in.RoleID); err != nil {
			return err
		}
		if err := insertRolePermissions(ctx, tx, in.OrganizationID, in.RoleID, permissions); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "role.update",
			ResourceType:   "organization_roles",
			ResourceID:     in.RoleID.String(),
			After:          map[string]any{"name": role.Name, "permissions": permissions},
		})
	})
	if err != nil {
		return nil, err
	}
	return &RoleWithPermissions{Role: role, Permissions: permissions}, nil
}

// DeleteRole removes a tenant-defined role. System roles (the seeded
// "Administrador" role) can never be deleted, and a role still assigned to
// a member is reported as a conflict rather than silently orphaning those
// assignments — the caller must unassign it first.
func (s *Service) DeleteRole(ctx context.Context, in DeleteRoleInput) error {
	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var isSystem bool
		var slug string
		if err := tx.QueryRow(ctx, `
			select is_system, slug from organization_roles where id = $1 and organization_id = $2 for update
		`, in.RoleID, in.OrganizationID).Scan(&isSystem, &slug); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("role_not_found", "Role not found")
			}
			return err
		}
		if isSystem {
			return domainerr.Forbidden("System roles cannot be deleted")
		}

		var inUse bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from organization_member_roles where organization_role_id = $1)
		`, in.RoleID).Scan(&inUse); err != nil {
			return err
		}
		if inUse {
			return domainerr.Conflict("role_in_use", "Role is still assigned to one or more members")
		}

		if _, err := tx.Exec(ctx, `delete from organization_permissions where organization_role_id = $1`, in.RoleID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from organization_roles where id = $1`, in.RoleID); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "role.delete",
			ResourceType:   "organization_roles",
			ResourceID:     in.RoleID.String(),
			After:          map[string]any{"slug": slug},
		})
	})
}

func (s *Service) GetRole(ctx context.Context, organizationID, roleID uuid.UUID) (*RoleWithPermissions, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, name, slug, description, is_system, is_default, status, created_at, updated_at
		from organization_roles
		where organization_id = $1 and id = $2
	`, organizationID, roleID)
	var role Role
	if err := row.Scan(
		&role.ID, &role.OrganizationID, &role.Name, &role.Slug, &role.Description,
		&role.IsSystem, &role.IsDefault, &role.Status, &role.CreatedAt, &role.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("role_not_found", "Role not found")
		}
		return nil, err
	}
	permissions, err := s.rolePermissions(ctx, role.ID)
	if err != nil {
		return nil, err
	}
	return &RoleWithPermissions{Role: role, Permissions: permissions}, nil
}

func (s *Service) ListRoles(ctx context.Context, organizationID uuid.UUID) ([]RoleWithPermissions, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, name, slug, description, is_system, is_default, status, created_at, updated_at
		from organization_roles
		where organization_id = $1
		order by created_at
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var role Role
		if err := rows.Scan(
			&role.ID, &role.OrganizationID, &role.Name, &role.Slug, &role.Description,
			&role.IsSystem, &role.IsDefault, &role.Status, &role.CreatedAt, &role.UpdatedAt,
		); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]RoleWithPermissions, 0, len(roles))
	for _, role := range roles {
		permissions, err := s.rolePermissions(ctx, role.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, RoleWithPermissions{Role: role, Permissions: permissions})
	}
	return out, nil
}

// AssignMemberRole grants a member a role, optionally scoped to a single
// company (CNPJ) within the tenant so e.g. an operator can be limited to
// specific legal entities.
func (s *Service) AssignMemberRole(ctx context.Context, in AssignMemberRoleInput) (*MemberRole, error) {
	if in.MemberID == uuid.Nil || in.RoleID == uuid.Nil {
		return nil, domainerr.Validation("invalid_assignment", "member_id and role_id are required")
	}

	var assignment MemberRole
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var memberStatus string
		if err := tx.QueryRow(ctx, `
			select status from organization_members where id = $1 and organization_id = $2
		`, in.MemberID, in.OrganizationID).Scan(&memberStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("member_not_found", "Member not found")
			}
			return err
		}

		var roleName, roleSlug, roleStatus string
		if err := tx.QueryRow(ctx, `
			select name, slug, status from organization_roles where id = $1 and organization_id = $2
		`, in.RoleID, in.OrganizationID).Scan(&roleName, &roleSlug, &roleStatus); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("role_not_found", "Role not found")
			}
			return err
		}
		if roleStatus != "active" {
			return domainerr.Validation("role_disabled", "Role is disabled")
		}

		if in.OrganizationCompanyID != nil {
			var exists bool
			if err := tx.QueryRow(ctx, `
				select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
			`, *in.OrganizationCompanyID, in.OrganizationID).Scan(&exists); err != nil {
				return err
			}
			if !exists {
				return domainerr.Validation("invalid_company_id", "organization_company_id must reference a company in this organization")
			}
		}

		now := time.Now().UTC()
		assignment = MemberRole{
			ID:                    ids.New(),
			OrganizationID:        in.OrganizationID,
			OrganizationMemberID:  in.MemberID,
			OrganizationRoleID:    in.RoleID,
			RoleName:              roleName,
			RoleSlug:              roleSlug,
			OrganizationCompanyID: in.OrganizationCompanyID,
			ValidFrom:             now,
			ValidUntil:            in.ValidUntil,
			CreatedAt:             now,
		}
		if _, err := tx.Exec(ctx, `
			insert into organization_member_roles (
				id, organization_id, organization_member_id, organization_role_id, organization_company_id, valid_from, valid_until, created_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
		`, assignment.ID, in.OrganizationID, in.MemberID, in.RoleID, in.OrganizationCompanyID, now, in.ValidUntil, now); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "member.role.assign",
			ResourceType:   "organization_member_roles",
			ResourceID:     assignment.ID.String(),
			After: map[string]any{
				"member_id": in.MemberID, "role_id": in.RoleID, "role_slug": roleSlug, "company_id": in.OrganizationCompanyID,
			},
		})
	})
	if err != nil {
		// The (member, role, company) triple has a unique constraint whose
		// auto-generated name is long enough to be truncated by Postgres'
		// 63-byte identifier limit, so a substring match on the constraint
		// name (as used elsewhere in this package) is not reliable here —
		// check the SQLSTATE instead.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, domainerr.Conflict("already_assigned", "Member already has this role assigned for this scope")
		}
		return nil, err
	}
	return &assignment, nil
}

// RemoveMemberRole revokes a role assignment. organization_company_id must
// match exactly (nil for an org-wide assignment) since it is part of the
// assignment's identity.
func (s *Service) RemoveMemberRole(ctx context.Context, in RemoveMemberRoleInput) error {
	return s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		query := `
			delete from organization_member_roles
			where organization_id = $1 and organization_member_id = $2 and organization_role_id = $3
		`
		args := []any{in.OrganizationID, in.MemberID, in.RoleID}
		if in.OrganizationCompanyID != nil {
			query += ` and organization_company_id = $4`
			args = append(args, *in.OrganizationCompanyID)
		} else {
			query += ` and organization_company_id is null`
		}
		tag, err := tx.Exec(ctx, query, args...)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("assignment_not_found", "Role assignment not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "member.role.remove",
			ResourceType:   "organization_member_roles",
			ResourceID:     in.RoleID.String(),
			After:          map[string]any{"member_id": in.MemberID, "role_id": in.RoleID, "company_id": in.OrganizationCompanyID},
		})
	})
}

func (s *Service) ListMemberRoles(ctx context.Context, organizationID, memberID uuid.UUID) ([]MemberRole, error) {
	rows, err := s.pool.Query(ctx, `
		select mr.id, mr.organization_id, mr.organization_member_id, mr.organization_role_id,
		       r.name, r.slug, mr.organization_company_id, mr.valid_from, mr.valid_until, mr.created_at
		from organization_member_roles mr
		join organization_roles r on r.id = mr.organization_role_id
		where mr.organization_id = $1 and mr.organization_member_id = $2
		order by mr.created_at desc
	`, organizationID, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []MemberRole
	for rows.Next() {
		var m MemberRole
		if err := rows.Scan(
			&m.ID, &m.OrganizationID, &m.OrganizationMemberID, &m.OrganizationRoleID,
			&m.RoleName, &m.RoleSlug, &m.OrganizationCompanyID, &m.ValidFrom, &m.ValidUntil, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MemberHasPermission reports whether the given user currently holds, within
// this organization, a role granting "resource:action". Only assignments
// whose valid_from/valid_until window covers now are considered. A
// company-scoped assignment still counts at the organization level here —
// restricting an action to a specific company is enforced separately by
// whatever handler acts on that company.
func (s *Service) MemberHasPermission(ctx context.Context, organizationID, userID uuid.UUID, permission string) (bool, error) {
	resource, action, ok := SplitPermission(permission)
	if !ok {
		return false, domainerr.Validation("invalid_permission", "permission must be in resource:action format")
	}
	var allowed bool
	err := s.pool.QueryRow(ctx, `
		select exists(
			select 1
			from organization_members m
			join organization_member_roles mr on mr.organization_member_id = m.id
			join organization_roles r on r.id = mr.organization_role_id and r.status = 'active'
			join organization_permissions p on p.organization_role_id = r.id
			where m.organization_id = $1
			  and m.user_id = $2
			  and m.status = 'active'
			  and p.resource = $3
			  and p.action = $4
			  and mr.valid_from <= now()
			  and (mr.valid_until is null or mr.valid_until > now())
		)
	`, organizationID, userID, resource, action).Scan(&allowed)
	if err != nil {
		return false, err
	}
	return allowed, nil
}

func (s *Service) rolePermissions(ctx context.Context, roleID uuid.UUID) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		select resource, action from organization_permissions where organization_role_id = $1 order by resource, action
	`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var resource, action string
		if err := rows.Scan(&resource, &action); err != nil {
			return nil, err
		}
		out = append(out, resource+":"+action)
	}
	return out, rows.Err()
}

func insertRolePermissions(ctx context.Context, tx pgx.Tx, organizationID, roleID uuid.UUID, permissions []string) error {
	for _, permission := range permissions {
		resource, action, _ := SplitPermission(permission)
		if _, err := tx.Exec(ctx, `
			insert into organization_permissions (id, organization_id, organization_role_id, resource, action)
			values ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, roleID, resource, action); err != nil {
			return err
		}
	}
	return nil
}
