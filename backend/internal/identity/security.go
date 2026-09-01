package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/messaging"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

const (
	loginMaxFailures = 8
)

func (s *Service) EnsureLoginAllowed(ctx context.Context, email string) error {
	if s == nil || s.pool == nil {
		return nil
	}
	normalized := NormalizeEmail(email)
	var failed int
	var windowStart time.Time
	var lockedUntil *time.Time
	err := s.pool.QueryRow(ctx, `
		select failed_count, window_started_at, locked_until
		from user_login_attempts where email_normalized = $1
	`, normalized).Scan(&failed, &windowStart, &lockedUntil)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if lockedUntil != nil && lockedUntil.After(now) {
		return domainerr.TooManyRequests("Too many failed login attempts. Try again later.")
	}
	return nil
}

func (s *Service) RecordLoginFailure(ctx context.Context, email string) error {
	if s == nil || s.pool == nil {
		return nil
	}
	normalized := NormalizeEmail(email)
	now := time.Now().UTC()
	_, err := s.pool.Exec(ctx, `
		insert into user_login_attempts (email_normalized, failed_count, window_started_at, locked_until)
		values ($1, 1, $2, null)
		on conflict (email_normalized) do update set
			failed_count = case
				when user_login_attempts.window_started_at + interval '15 minutes' < $2 then 1
				else user_login_attempts.failed_count + 1
			end,
			window_started_at = case
				when user_login_attempts.window_started_at + interval '15 minutes' < $2 then $2
				else user_login_attempts.window_started_at
			end,
			locked_until = case
				when (
					case
						when user_login_attempts.window_started_at + interval '15 minutes' < $2 then 1
						else user_login_attempts.failed_count + 1
					end
				) >= $3 then $2 + interval '15 minutes'
				else null
			end
	`, normalized, now, loginMaxFailures)
	return err
}

func (s *Service) ClearLoginFailures(ctx context.Context, email string) error {
	if s == nil || s.pool == nil {
		return nil
	}
	_, err := s.pool.Exec(ctx, `delete from user_login_attempts where email_normalized = $1`, NormalizeEmail(email))
	return err
}

func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	normalized := NormalizeEmail(email)
	var userID uuid.UUID
	var status string
	err := s.pool.QueryRow(ctx, `
		select id, status from users where email_normalized = $1 and deleted_at is null
	`, normalized).Scan(&userID, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		// Do not reveal whether the email exists.
		return nil
	}
	if err != nil {
		return err
	}
	if status != "active" {
		return nil
	}
	token, err := crypto.RandomToken(32)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	expires := now.Add(1 * time.Hour)
	return s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			update password_reset_tokens set used_at = $2
			where user_id = $1 and used_at is null
		`, userID, now)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
			values ($1,$2,$3,$4,$5)
		`, ids.New(), userID, crypto.HashToken(token), expires, now)
		if err != nil {
			return err
		}
		_, err = messaging.InsertOutboxFrom(
			ctx, tx, uuid.Nil, "fiscal_saas/identity", "users", userID,
			messaging.EventPasswordResetRequested,
			map[string]any{
				"user_id":    userID,
				"email":      email,
				"token":      token,
				"expires_at": expires,
			},
		)
		return err
	})
}

func (s *Service) ResetPassword(ctx context.Context, token, newPassword string, policy PasswordPolicy) error {
	if err := ValidatePasswordAgainst(newPassword, policy); err != nil {
		return err
	}
	tokenHash := crypto.HashToken(strings.TrimSpace(token))
	now := time.Now().UTC()
	hash, err := crypto.HashPassword(newPassword)
	if err != nil {
		return err
	}
	return s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		var resetID, userID uuid.UUID
		err := tx.QueryRow(ctx, `
			select id, user_id from password_reset_tokens
			where token_hash = $1 and used_at is null and expires_at > $2
			for update
		`, tokenHash, now).Scan(&resetID, &userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return domainerr.Validation("invalid_reset_token", "Reset token is invalid or expired")
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update users set password_hash = $2, password_changed_at = $3, updated_at = $3
			where id = $1 and deleted_at is null
		`, userID, hash, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `update password_reset_tokens set used_at = $2 where id = $1`, resetID, now); err != nil {
			return err
		}
		_, _ = tx.Exec(ctx, `update user_sessions set revoked_at = $2 where user_id = $1 and revoked_at is null`, userID, now)
		return nil
	})
}
