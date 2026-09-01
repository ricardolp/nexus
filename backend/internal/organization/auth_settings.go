package organization

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type AuthenticationSettings struct {
	OrganizationID                uuid.UUID  `json:"organization_id"`
	MinPasswordLength             int        `json:"min_password_length"`
	MaxPasswordLength             int        `json:"max_password_length"`
	RequireUppercase              bool       `json:"require_uppercase"`
	RequireLowercase              bool       `json:"require_lowercase"`
	RequireNumber                 bool       `json:"require_number"`
	RequireSpecial                bool       `json:"require_special"`
	MFARequired                   bool       `json:"mfa_required"`
	AccessLocked                  bool       `json:"access_locked"`
	AccessLockMessage             *string    `json:"access_lock_message,omitempty"`
	AccessLockedAt                *time.Time `json:"access_locked_at,omitempty"`
	AccessLockedByUserID          *uuid.UUID `json:"access_locked_by_user_id,omitempty"`
	SessionIdleTimeoutMinutes     int        `json:"session_idle_timeout_minutes"`
	SessionAbsoluteTimeoutMinutes int        `json:"session_absolute_timeout_minutes"`
	CreatedAt                     time.Time  `json:"created_at"`
	UpdatedAt                     time.Time  `json:"updated_at"`
}

func (s *Service) ensureAuthSettings(ctx context.Context, organizationID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		insert into organization_authentication_settings (organization_id)
		values ($1)
		on conflict (organization_id) do nothing
	`, organizationID)
	return err
}

func (s *Service) GetAuthenticationSettings(ctx context.Context, organizationID uuid.UUID) (*AuthenticationSettings, error) {
	if err := s.ensureAuthSettings(ctx, organizationID); err != nil {
		return nil, err
	}
	row := s.pool.QueryRow(ctx, `
		select organization_id, min_password_length, max_password_length,
		       require_uppercase, require_lowercase, require_number, require_special,
		       mfa_required, access_locked, access_lock_message, access_locked_at, access_locked_by_user_id,
		       session_idle_timeout_minutes, session_absolute_timeout_minutes, created_at, updated_at
		from organization_authentication_settings
		where organization_id = $1
	`, organizationID)
	var out AuthenticationSettings
	if err := row.Scan(
		&out.OrganizationID, &out.MinPasswordLength, &out.MaxPasswordLength,
		&out.RequireUppercase, &out.RequireLowercase, &out.RequireNumber, &out.RequireSpecial,
		&out.MFARequired, &out.AccessLocked, &out.AccessLockMessage, &out.AccessLockedAt, &out.AccessLockedByUserID,
		&out.SessionIdleTimeoutMinutes, &out.SessionAbsoluteTimeoutMinutes, &out.CreatedAt, &out.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("auth_settings_not_found", "Authentication settings not found")
		}
		return nil, err
	}
	return &out, nil
}

type UpdateAuthenticationSettingsInput struct {
	OrganizationID                uuid.UUID
	ActorUserID                   uuid.UUID
	MinPasswordLength             *int
	MaxPasswordLength             *int
	RequireUppercase              *bool
	RequireLowercase              *bool
	RequireNumber                 *bool
	RequireSpecial                *bool
	MFARequired                   *bool
	AccessLocked                  *bool
	AccessLockMessage             *string
	SessionIdleTimeoutMinutes     *int
	SessionAbsoluteTimeoutMinutes *int
}

func (s *Service) UpdateAuthenticationSettings(ctx context.Context, in UpdateAuthenticationSettingsInput) (*AuthenticationSettings, error) {
	current, err := s.GetAuthenticationSettings(ctx, in.OrganizationID)
	if err != nil {
		return nil, err
	}
	next := *current
	if in.MinPasswordLength != nil {
		next.MinPasswordLength = *in.MinPasswordLength
	}
	if in.MaxPasswordLength != nil {
		next.MaxPasswordLength = *in.MaxPasswordLength
	}
	if in.RequireUppercase != nil {
		next.RequireUppercase = *in.RequireUppercase
	}
	if in.RequireLowercase != nil {
		next.RequireLowercase = *in.RequireLowercase
	}
	if in.RequireNumber != nil {
		next.RequireNumber = *in.RequireNumber
	}
	if in.RequireSpecial != nil {
		next.RequireSpecial = *in.RequireSpecial
	}
	if in.MFARequired != nil {
		next.MFARequired = *in.MFARequired
	}
	if in.SessionIdleTimeoutMinutes != nil {
		next.SessionIdleTimeoutMinutes = *in.SessionIdleTimeoutMinutes
	}
	if in.SessionAbsoluteTimeoutMinutes != nil {
		next.SessionAbsoluteTimeoutMinutes = *in.SessionAbsoluteTimeoutMinutes
	}
	now := time.Now().UTC()
	if in.AccessLocked != nil {
		next.AccessLocked = *in.AccessLocked
		if *in.AccessLocked {
			next.AccessLockedAt = &now
			next.AccessLockedByUserID = &in.ActorUserID
			if in.AccessLockMessage != nil {
				msg := strings.TrimSpace(*in.AccessLockMessage)
				if msg == "" {
					msg = "Sistema em manutenção. Tente novamente em breve."
				}
				next.AccessLockMessage = &msg
			} else if next.AccessLockMessage == nil {
				msg := "Sistema em manutenção. Tente novamente em breve."
				next.AccessLockMessage = &msg
			}
		} else {
			next.AccessLockedAt = nil
			next.AccessLockedByUserID = nil
			next.AccessLockMessage = nil
		}
	} else if in.AccessLockMessage != nil && next.AccessLocked {
		msg := strings.TrimSpace(*in.AccessLockMessage)
		next.AccessLockMessage = &msg
	}

	policy := next
	if policy.MinPasswordLength < 8 {
		policy.MinPasswordLength = 8
	}
	if policy.MinPasswordLength > 128 {
		policy.MinPasswordLength = 128
	}
	if policy.MaxPasswordLength < policy.MinPasswordLength {
		policy.MaxPasswordLength = policy.MinPasswordLength
	}
	if policy.MaxPasswordLength > 128 {
		policy.MaxPasswordLength = 128
	}
	next.MinPasswordLength = policy.MinPasswordLength
	next.MaxPasswordLength = policy.MaxPasswordLength
	if next.SessionIdleTimeoutMinutes < 5 || next.SessionIdleTimeoutMinutes > 10080 {
		return nil, domainerr.Validation("invalid_idle_timeout", "session_idle_timeout_minutes must be between 5 and 10080")
	}
	if next.SessionAbsoluteTimeoutMinutes < 15 || next.SessionAbsoluteTimeoutMinutes > 43200 {
		return nil, domainerr.Validation("invalid_absolute_timeout", "session_absolute_timeout_minutes must be between 15 and 43200")
	}

	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			update organization_authentication_settings set
				min_password_length = $2,
				max_password_length = $3,
				require_uppercase = $4,
				require_lowercase = $5,
				require_number = $6,
				require_special = $7,
				mfa_required = $8,
				access_locked = $9,
				access_lock_message = $10,
				access_locked_at = $11,
				access_locked_by_user_id = $12,
				session_idle_timeout_minutes = $13,
				session_absolute_timeout_minutes = $14,
				updated_at = $15
			where organization_id = $1
		`, in.OrganizationID,
			next.MinPasswordLength, next.MaxPasswordLength,
			next.RequireUppercase, next.RequireLowercase, next.RequireNumber, next.RequireSpecial,
			next.MFARequired, next.AccessLocked, next.AccessLockMessage, next.AccessLockedAt, next.AccessLockedByUserID,
			next.SessionIdleTimeoutMinutes, next.SessionAbsoluteTimeoutMinutes, now,
		)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "organization.auth_settings.update",
			ResourceType:   "organization_authentication_settings",
			ResourceID:     in.OrganizationID.String(),
			After:          next,
		})
	})
	if err != nil {
		return nil, err
	}
	next.UpdatedAt = now
	return &next, nil
}
