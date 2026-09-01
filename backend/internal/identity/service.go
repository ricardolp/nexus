package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/db"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/nexus/fiscal-messaging/internal/platform/storage"
)

type Service struct {
	pool    *db.Pool
	secrets []byte
	store   storage.ObjectStore
}

func NewService(pool *db.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) Configure(secrets []byte, store storage.ObjectStore) {
	s.secrets = secrets
	s.store = store
}

func (s *Service) Register(ctx context.Context, in RegisterInput) (*User, error) {
	email, normalized, role, err := ValidateRegisterInput(in)
	if err != nil {
		return nil, err
	}

	hash, err := crypto.HashPassword(in.Password)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	user := &User{
		ID:              ids.New(),
		PlatformRole:    role,
		Email:           email,
		EmailNormalized: normalized,
		Status:          "active",
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	_, err = s.pool.Exec(ctx, `
		insert into users (
			id, platform_role, email, email_normalized, status, password_hash, password_changed_at, created_at, updated_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, user.ID, user.PlatformRole, user.Email, user.EmailNormalized, user.Status, hash, now, now, now)
	if err != nil {
		if isEmailConflict(err) {
			return nil, domainerr.Conflict("email_already_exists", "Email already registered")
		}
		return nil, err
	}
	return user, nil
}

func (s *Service) InviteUser(ctx context.Context, in InviteUserInput) (*Invitation, error) {
	email, normalized, role, err := ValidateInviteUserInput(in)
	if err != nil {
		return nil, err
	}

	token, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	tokenHash := crypto.HashToken(token)
	now := time.Now().UTC()
	expiresAt := now.Add(InvitationTTL)
	user := User{
		ID:              ids.New(),
		PlatformRole:    role,
		Email:           email,
		EmailNormalized: normalized,
		Status:          "pending",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	invitation := Invitation{
		ID:             ids.New(),
		UserID:         user.ID,
		OrganizationID: in.OrganizationID,
		Email:          email,
		ExpiresAt:      expiresAt,
		CreatedAt:      now,
	}

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if in.OrganizationID != nil {
			var active bool
			if err := tx.QueryRow(ctx, `
				select exists(select 1 from organizations where id = $1 and status = 'active')
			`, *in.OrganizationID).Scan(&active); err != nil {
				return err
			}
			if !active {
				return domainerr.Validation("invalid_organization_id", "organization_id must reference an active organization")
			}
		}

		_, err := tx.Exec(ctx, `
			insert into users (
				id, platform_role, email, email_normalized, status, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$6)
		`, user.ID, user.PlatformRole, user.Email, user.EmailNormalized, user.Status, now)
		if err != nil {
			return err
		}

		_, err = tx.Exec(ctx, `
			insert into user_invitations (
				id, user_id, organization_id, token_hash, expires_at, invited_by_user_id, created_at
			) values ($1,$2,$3,$4,$5,$6,$7)
		`, invitation.ID, user.ID, invitation.OrganizationID, tokenHash, expiresAt, in.InvitedBy, now)
		if err != nil {
			return err
		}

		if in.OrganizationID != nil {
			_, err = tx.Exec(ctx, `
				insert into organization_members (
					id, organization_id, user_id, status, created_by_user_id, created_at
				) values ($1,$2,$3,'invited',$4,$5)
			`, ids.New(), *in.OrganizationID, user.ID, in.InvitedBy, now)
			if err != nil {
				return err
			}
		}

		if err := enqueueUserInvited(ctx, tx, invitation, user, token); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: invitation.OrganizationID,
			ActorType:      "user",
			ActorID:        in.InvitedBy.String(),
			Action:         "user.invite",
			ResourceType:   "users",
			ResourceID:     user.ID.String(),
			After: map[string]any{
				"email": user.Email, "platform_role": user.PlatformRole, "status": user.Status,
			},
		})
	})
	if err != nil {
		if isEmailConflict(err) {
			return nil, domainerr.Conflict("email_already_exists", "Email already registered")
		}
		return nil, err
	}
	return &invitation, nil
}

// ResendInvitation revokes the current pending invitation for an invited
// organization member, issues a new 48h token, and re-queues the invite e-mail.
// It is the recovery path when the original link expired or never arrived.
func (s *Service) ResendInvitation(ctx context.Context, in ResendInvitationInput) (*Invitation, error) {
	if err := ValidateResendInvitationInput(in); err != nil {
		return nil, err
	}

	token, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	tokenHash := crypto.HashToken(token)
	now := time.Now().UTC()
	expiresAt := now.Add(InvitationTTL)
	invitation := Invitation{
		ID:             ids.New(),
		OrganizationID: &in.OrganizationID,
		ExpiresAt:      expiresAt,
		CreatedAt:      now,
	}

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var active bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from organizations where id = $1 and status = 'active')
		`, in.OrganizationID).Scan(&active); err != nil {
			return err
		}
		if !active {
			return domainerr.Validation("invalid_organization_id", "organization_id must reference an active organization")
		}

		var memberStatus, userStatus, email, platformRole string
		err := tx.QueryRow(ctx, `
			select m.user_id, m.status, u.status, u.email, u.platform_role
			from organization_members m
			join users u on u.id = m.user_id
			where m.id = $1
			  and m.organization_id = $2
			  and u.deleted_at is null
			for update of m, u
		`, in.MemberID, in.OrganizationID).Scan(
			&invitation.UserID, &memberStatus, &userStatus, &email, &platformRole,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return domainerr.NotFound("member_not_found", "Member not found")
			}
			return err
		}
		if memberStatus != "invited" || userStatus != "pending" {
			return domainerr.Conflict("invitation_not_pending", "Only pending invitations can be resent")
		}
		invitation.Email = email

		if _, err := tx.Exec(ctx, `
			update user_invitations
			set revoked_at = $3
			where user_id = $1
			  and organization_id is not distinct from $2
			  and accepted_at is null
			  and revoked_at is null
		`, invitation.UserID, in.OrganizationID, now); err != nil {
			return err
		}

		if _, err := tx.Exec(ctx, `
			insert into user_invitations (
				id, user_id, organization_id, token_hash, expires_at, invited_by_user_id, created_at
			) values ($1,$2,$3,$4,$5,$6,$7)
		`, invitation.ID, invitation.UserID, invitation.OrganizationID, tokenHash, expiresAt, in.InvitedBy, now); err != nil {
			return err
		}

		if err := enqueueUserInvited(ctx, tx, invitation, User{
			ID: invitation.UserID, Email: email, PlatformRole: platformRole,
		}, token); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: invitation.OrganizationID,
			ActorType:      "user",
			ActorID:        in.InvitedBy.String(),
			Action:         "user.invite.resend",
			ResourceType:   "users",
			ResourceID:     invitation.UserID.String(),
			After: map[string]any{
				"email": email, "invitation_id": invitation.ID, "expires_at": invitation.ExpiresAt,
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

func enqueueUserInvited(ctx context.Context, tx pgx.Tx, invitation Invitation, user User, token string) error {
	eventOrganizationID := uuid.Nil
	if invitation.OrganizationID != nil {
		eventOrganizationID = *invitation.OrganizationID
	}
	_, err := messaging.InsertOutboxFrom(
		ctx,
		tx,
		eventOrganizationID,
		"fiscal_saas/identity",
		"users",
		user.ID,
		messaging.EventUserInvited,
		map[string]any{
			"invitation_id":   invitation.ID,
			"user_id":         user.ID,
			"email":           user.Email,
			"platform_role":   user.PlatformRole,
			"organization_id": invitation.OrganizationID,
			"token":           token,
			"expires_at":      invitation.ExpiresAt,
		},
	)
	return err
}

func (s *Service) AcceptInvitation(ctx context.Context, in AcceptInvitationInput) (*User, error) {
	if strings.TrimSpace(in.Token) == "" {
		return nil, domainerr.Validation("invitation_token_required", "token is required")
	}
	policy, err := s.PasswordPolicyForInvitationToken(ctx, in.Token)
	if err != nil {
		return nil, err
	}
	if err := ValidatePasswordAgainst(in.Password, policy); err != nil {
		return nil, err
	}
	hash, err := crypto.HashPassword(in.Password)
	if err != nil {
		return nil, err
	}
	tokenHash := crypto.HashToken(strings.TrimSpace(in.Token))
	now := time.Now().UTC()
	var user User

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var invitationID uuid.UUID
		var organizationID *uuid.UUID
		err := tx.QueryRow(ctx, `
			select i.id, i.organization_id,
			       u.id, u.platform_role, u.email, u.email_normalized, u.status, u.created_at, u.updated_at
			from user_invitations i
			join users u on u.id = i.user_id
			where i.token_hash = $1
			  and i.accepted_at is null
			  and i.revoked_at is null
			  and i.expires_at > $2
			  and u.status = 'pending'
			  and u.deleted_at is null
			for update of i, u
		`, tokenHash, now).Scan(
			&invitationID, &organizationID,
			&user.ID, &user.PlatformRole, &user.Email, &user.EmailNormalized,
			&user.Status, &user.CreatedAt, &user.UpdatedAt,
		)
		if errors.Is(err, pgx.ErrNoRows) {
			return domainerr.Validation("invalid_invitation", "Invitation is invalid, expired or already used")
		}
		if err != nil {
			return err
		}

		user.Status = "active"
		user.EmailVerifiedAt = &now
		user.UpdatedAt = now
		if _, err = tx.Exec(ctx, `
			update users
			set status = 'active', email_verified_at = $2, password_hash = $3,
			    password_changed_at = $2, updated_at = $2
			where id = $1
		`, user.ID, now, hash); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `
			update user_invitations set accepted_at = $2 where id = $1
		`, invitationID, now); err != nil {
			return err
		}
		if organizationID != nil {
			if _, err = tx.Exec(ctx, `
				update organization_members
				set status = 'active', joined_at = $3
				where organization_id = $1 and user_id = $2 and status = 'invited'
			`, *organizationID, user.ID, now); err != nil {
				return err
			}
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: organizationID,
			ActorType:      "user",
			ActorID:        user.ID.String(),
			Action:         "user.invitation.accept",
			ResourceType:   "users",
			ResourceID:     user.ID.String(),
			After:          map[string]any{"status": user.Status, "email_verified_at": now},
		})
	})
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	if err := ValidateLoginInput(email, password); err != nil {
		return nil, err
	}
	normalized := NormalizeEmail(email)
	row := s.pool.QueryRow(ctx, `
		select id, platform_role, email, email_normalized, email_verified_at, status, password_hash, created_at, updated_at
		from users where email_normalized = $1 and deleted_at is null
	`, normalized)

	var u User
	var hash *string
	if err := row.Scan(
		&u.ID, &u.PlatformRole, &u.Email, &u.EmailNormalized, &u.EmailVerifiedAt, &u.Status, &hash, &u.CreatedAt, &u.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.Unauthorized("Invalid email or password")
		}
		return nil, err
	}
	if u.Status != "active" {
		return nil, domainerr.Forbidden("User is not active")
	}
	if hash == nil || !crypto.VerifyPassword(*hash, password) {
		return nil, domainerr.Unauthorized("Invalid email or password")
	}

	_, _ = s.pool.Exec(ctx, `update users set last_login_at = $1, updated_at = $1 where id = $2`, time.Now().UTC(), u.ID)
	return &u, nil
}

func (s *Service) GetByID(ctx context.Context, id uuid.UUID) (*User, error) {
	return s.loadUserByID(ctx, id)
}

// GetByEmail looks up an existing user by email — used when linking an
// already-registered user to an organization without going through the
// invite/accept flow. Returns domainerr.NotFound if no such user exists.
func (s *Service) GetByEmail(ctx context.Context, email string) (*User, error) {
	if s == nil || s.pool == nil {
		return nil, domainerr.NotFound("user_not_found", "No user exists with this email")
	}
	row := s.pool.QueryRow(ctx, `
		select id, platform_role, email, email_normalized, email_verified_at, status, created_at, updated_at
		from users where email_normalized = $1 and deleted_at is null
	`, NormalizeEmail(email))
	var u User
	if err := row.Scan(&u.ID, &u.PlatformRole, &u.Email, &u.EmailNormalized, &u.EmailVerifiedAt, &u.Status, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("user_not_found", "No user exists with this email")
		}
		return nil, err
	}
	return &u, nil
}

// ListPlatformStaff returns every user with a platform-wide staff role
// (admin/system/support) for the platform admin panel — never includes
// ordinary tenant members.
func (s *Service) ListPlatformStaff(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(ctx, `
		select id, platform_role, email, email_normalized, email_verified_at, status, last_login_at, created_at, updated_at
		from users
		where platform_role in ($1, $2, $3)
		  and deleted_at is null
		order by created_at desc
	`, PlatformRoleAdmin, PlatformRoleSystem, PlatformRoleSupport)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.PlatformRole, &u.Email, &u.EmailNormalized, &u.EmailVerifiedAt, &u.Status, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, nil
}

func (s *Service) ListUserAuditEvents(ctx context.Context, userID uuid.UUID, organizationID *uuid.UUID, limit int) ([]audit.Record, error) {
	return audit.ListForUser(ctx, s.pool, userID, organizationID, limit)
}

// SoftDelete marks a user as deleted without removing the row. Memberships
// are set to removed and pending invitations are revoked so the identity
// disappears from every list while remaining available for audit and FKs.
// The unique email index only covers non-deleted rows, so the same address
// can be invited again afterwards.
func (s *Service) SoftDelete(ctx context.Context, id, actorID uuid.UUID) error {
	if id == uuid.Nil {
		return domainerr.Validation("invalid_user_id", "user_id is required")
	}
	if actorID == uuid.Nil {
		return domainerr.Validation("actor_required", "actor is required")
	}
	if id == actorID {
		return domainerr.Validation("cannot_delete_self", "You cannot delete your own user")
	}

	return s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var email, role, status string
		err := tx.QueryRow(ctx, `
			select email, platform_role, status from users
			where id = $1 and deleted_at is null
			for update
		`, id).Scan(&email, &role, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return domainerr.NotFound("user_not_found", "User not found")
		}
		if err != nil {
			return err
		}

		now := time.Now().UTC()
		if _, err := tx.Exec(ctx, `
			update users
			set deleted_at = $2, deleted_by_user_id = $3, status = 'disabled', updated_at = $2
			where id = $1 and deleted_at is null
		`, id, now, actorID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update organization_members
			set status = 'removed'
			where user_id = $1 and status <> 'removed'
		`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update user_invitations
			set revoked_at = $2
			where user_id = $1 and accepted_at is null and revoked_at is null
		`, id, now); err != nil {
			return err
		}

		return audit.Write(ctx, tx, audit.Event{
			ActorType:    "user",
			ActorID:      actorID.String(),
			Action:       "user.soft_delete",
			ResourceType: "users",
			ResourceID:   id.String(),
			Before: map[string]any{
				"email": email, "platform_role": role, "status": status,
			},
			After: map[string]any{
				"deleted_at": now, "status": "disabled",
			},
		})
	})
}

func isEmailConflict(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "users_email_normalized")
}
