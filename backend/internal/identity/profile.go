package identity

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const (
	userSelectCols = `
		id, platform_role, email, email_normalized, email_verified_at, status,
		display_name, phone, bio, timezone, locale, avatar_object_key,
		coalesce(appearance_json, '{}'::jsonb), coalesce(notification_preferences_json, '{}'::jsonb),
		password_changed_at, created_at, updated_at`
)

func scanUser(row pgx.Row) (*User, error) {
	var u User
	var avatarKey *string
	var appearance, prefs []byte
	err := row.Scan(
		&u.ID, &u.PlatformRole, &u.Email, &u.EmailNormalized, &u.EmailVerifiedAt, &u.Status,
		&u.DisplayName, &u.Phone, &u.Bio, &u.Timezone, &u.Locale, &avatarKey,
		&appearance, &prefs,
		&u.PasswordChangedAt, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	u.AvatarObjectKey = avatarKey
	u.HasAvatar = avatarKey != nil && strings.TrimSpace(*avatarKey) != ""
	u.AppearanceJSON = appearance
	u.NotificationPrefsJSON = prefs
	return &u, nil
}

func (s *Service) loadUserByID(ctx context.Context, id uuid.UUID) (*User, error) {
	row := s.pool.QueryRow(ctx, `select `+userSelectCols+` from users where id = $1 and deleted_at is null`, id)
	u, err := scanUser(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.NotFound("user_not_found", "User not found")
	}
	if err != nil {
		return nil, err
	}
	enabled, err := s.HasActiveMFA(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	u.MFAEnabled = enabled
	return u, nil
}

type UpdateProfileInput struct {
	UserID        uuid.UUID
	DisplayName   *string
	Phone         *string
	Bio           *string
	Timezone      *string
	Locale        *string
	Appearance    json.RawMessage
	Notifications json.RawMessage
}

func (s *Service) UpdateProfile(ctx context.Context, in UpdateProfileInput) (*User, error) {
	if in.UserID == uuid.Nil {
		return nil, domainerr.Validation("invalid_user_id", "user_id is required")
	}
	now := time.Now().UTC()
	var displayName, phone, bio, timezone, locale *string
	if in.DisplayName != nil {
		v := strings.TrimSpace(*in.DisplayName)
		if v == "" {
			return nil, domainerr.Validation("invalid_display_name", "display_name must not be empty")
		}
		if utf8.RuneCountInString(v) > 120 {
			return nil, domainerr.Validation("invalid_display_name", "display_name must be at most 120 characters")
		}
		displayName = &v
	}
	if in.Phone != nil {
		v := strings.TrimSpace(*in.Phone)
		if utf8.RuneCountInString(v) > 40 {
			return nil, domainerr.Validation("invalid_phone", "phone must be at most 40 characters")
		}
		if v == "" {
			displayName = displayName // keep
			phone = nil
		} else {
			phone = &v
		}
	}
	if in.Bio != nil {
		v := strings.TrimSpace(*in.Bio)
		if utf8.RuneCountInString(v) > 280 {
			return nil, domainerr.Validation("invalid_bio", "bio must be at most 280 characters")
		}
		if v == "" {
			bio = nil
		} else {
			bio = &v
		}
	}
	if in.Timezone != nil {
		v := strings.TrimSpace(*in.Timezone)
		if utf8.RuneCountInString(v) > 80 {
			return nil, domainerr.Validation("invalid_timezone", "timezone must be at most 80 characters")
		}
		if v == "" {
			timezone = nil
		} else {
			timezone = &v
		}
	}
	if in.Locale != nil {
		v := strings.TrimSpace(*in.Locale)
		if utf8.RuneCountInString(v) > 20 {
			return nil, domainerr.Validation("invalid_locale", "locale must be at most 20 characters")
		}
		if v == "" {
			locale = nil
		} else {
			locale = &v
		}
	}

	appearance := []byte("{}")
	if len(in.Appearance) > 0 {
		if !json.Valid(in.Appearance) {
			return nil, domainerr.Validation("invalid_appearance", "appearance_json must be valid JSON")
		}
		appearance = in.Appearance
	}
	notifications := []byte("{}")
	if len(in.Notifications) > 0 {
		if !json.Valid(in.Notifications) {
			return nil, domainerr.Validation("invalid_notifications", "notification_preferences_json must be valid JSON")
		}
		notifications = in.Notifications
	}

	_, err := s.pool.Exec(ctx, `
		update users set
			display_name = coalesce($2, display_name),
			phone = case when $3::boolean then $4 else phone end,
			bio = case when $5::boolean then $6 else bio end,
			timezone = case when $7::boolean then $8 else timezone end,
			locale = case when $9::boolean then $10 else locale end,
			appearance_json = case when $11::boolean then $12::jsonb else appearance_json end,
			notification_preferences_json = case when $13::boolean then $14::jsonb else notification_preferences_json end,
			updated_at = $15
		where id = $1 and deleted_at is null
	`, in.UserID,
		displayName,
		in.Phone != nil, phone,
		in.Bio != nil, bio,
		in.Timezone != nil, timezone,
		in.Locale != nil, locale,
		len(in.Appearance) > 0, appearance,
		len(in.Notifications) > 0, notifications,
		now,
	)
	if err != nil {
		return nil, err
	}
	return s.loadUserByID(ctx, in.UserID)
}

type ChangePasswordInput struct {
	UserID          uuid.UUID
	CurrentPassword string
	NewPassword     string
	Policy          PasswordPolicy
	RevokeOthers    bool
	CurrentSession  uuid.UUID
}

func (s *Service) ChangePassword(ctx context.Context, in ChangePasswordInput) error {
	if in.UserID == uuid.Nil {
		return domainerr.Validation("invalid_user_id", "user_id is required")
	}
	if err := ValidatePasswordAgainst(in.NewPassword, in.Policy); err != nil {
		return err
	}
	var hash *string
	err := s.pool.QueryRow(ctx, `
		select password_hash from users where id = $1 and deleted_at is null
	`, in.UserID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return domainerr.NotFound("user_not_found", "User not found")
	}
	if err != nil {
		return err
	}
	if hash == nil || !crypto.VerifyPassword(*hash, in.CurrentPassword) {
		return domainerr.Unauthorized("Current password is incorrect")
	}
	newHash, err := crypto.HashPassword(in.NewPassword)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		update users set password_hash = $2, password_changed_at = $3, updated_at = $3
		where id = $1
	`, in.UserID, newHash, now)
	if err != nil {
		return err
	}
	_ = s.RecordAuthEvent(ctx, AuthEventInput{
		UserID: &in.UserID, EventType: "password.changed", Outcome: "success",
	})
	if in.RevokeOthers && in.CurrentSession != uuid.Nil {
		_, _ = s.RevokeOtherSessions(ctx, in.UserID, in.CurrentSession)
	}
	return nil
}

type AdminSetPasswordInput struct {
	ActorUserID    uuid.UUID
	UserID         uuid.UUID
	Password       string
	Policy         PasswordPolicy
	OrganizationID *uuid.UUID
	IPAddress      string
	UserAgent      string
}

// AdminSetPassword lets a privileged actor set a user's password without the
// current one. MFA enrollment is left untouched. Sessions are revoked so the
// next login uses the new password (and MFA if already configured).
func (s *Service) AdminSetPassword(ctx context.Context, in AdminSetPasswordInput) error {
	if in.UserID == uuid.Nil {
		return domainerr.Validation("invalid_user_id", "user_id is required")
	}
	if in.ActorUserID == in.UserID {
		return domainerr.Validation("cannot_set_own_password", "Use the profile password change to update your own password")
	}
	if err := ValidatePasswordAgainst(in.Password, in.Policy); err != nil {
		return err
	}
	hash, err := crypto.HashPassword(in.Password)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var status string
		var emailNormalized string
		err := tx.QueryRow(ctx, `
			select status, email_normalized from users where id = $1 and deleted_at is null for update
		`, in.UserID).Scan(&status, &emailNormalized)
		if errors.Is(err, pgx.ErrNoRows) {
			return domainerr.NotFound("user_not_found", "User not found")
		}
		if err != nil {
			return err
		}
		if status == "suspended" {
			return domainerr.Conflict("user_suspended", "Cannot set password for a suspended user")
		}
		if _, err := tx.Exec(ctx, `
			update users
			set password_hash = $2, password_changed_at = $3, updated_at = $3,
			    status = case when status = 'pending' then 'active' else status end,
			    email_verified_at = coalesce(email_verified_at, $3)
			where id = $1
		`, in.UserID, hash, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update user_invitations
			set accepted_at = coalesce(accepted_at, $2)
			where user_id = $1 and accepted_at is null and revoked_at is null
		`, in.UserID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update organization_members
			set status = 'active', joined_at = coalesce(joined_at, $2)
			where user_id = $1 and status = 'invited'
		`, in.UserID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update user_sessions set revoked_at = $2 where user_id = $1 and revoked_at is null
		`, in.UserID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from user_login_attempts where email_normalized = $1`, emailNormalized); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return err
	}
	_ = s.RecordAuthEvent(ctx, AuthEventInput{
		UserID:         &in.UserID,
		OrganizationID: in.OrganizationID,
		EventType:      "password.admin_set",
		Outcome:        "success",
		IPAddress:      in.IPAddress,
		UserAgent:      in.UserAgent,
		Metadata:       map[string]any{"actor_user_id": in.ActorUserID.String()},
	})
	return nil
}

func (s *Service) PasswordPolicyForOrganization(ctx context.Context, organizationID *uuid.UUID) (PasswordPolicy, error) {
	if organizationID == nil || *organizationID == uuid.Nil {
		return DefaultPasswordPolicy(), nil
	}
	var p PasswordPolicy
	err := s.pool.QueryRow(ctx, `
		select min_password_length, max_password_length,
		       require_uppercase, require_lowercase, require_number, require_special
		from organization_authentication_settings
		where organization_id = $1
	`, *organizationID).Scan(
		&p.MinLength, &p.MaxLength,
		&p.RequireUppercase, &p.RequireLowercase, &p.RequireNumber, &p.RequireSpecial,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultPasswordPolicy(), nil
	}
	if err != nil {
		return PasswordPolicy{}, err
	}
	return ClampPasswordPolicy(p), nil
}

func (s *Service) PasswordPolicyForInvitationToken(ctx context.Context, token string) (PasswordPolicy, error) {
	tokenHash := crypto.HashToken(strings.TrimSpace(token))
	var orgID *uuid.UUID
	err := s.pool.QueryRow(ctx, `
		select organization_id from user_invitations
		where token_hash = $1 and accepted_at is null and revoked_at is null and expires_at > now()
	`, tokenHash).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return PasswordPolicy{}, domainerr.Validation("invalid_invitation", "Invitation is invalid, expired or already used")
	}
	if err != nil {
		return PasswordPolicy{}, err
	}
	return s.PasswordPolicyForOrganization(ctx, orgID)
}
