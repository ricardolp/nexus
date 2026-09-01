package identity

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
	"github.com/pquerna/otp/totp"
)

type MFAStatus struct {
	Enabled bool `json:"enabled"`
}

type MFAEnrollResult struct {
	Secret     string `json:"secret"`
	OTPAuthURL string `json:"otpauth_url"`
}

type AuthEventInput struct {
	UserID         *uuid.UUID
	OrganizationID *uuid.UUID
	EventType      string
	Outcome        string
	IPAddress      string
	UserAgent      string
	Metadata       map[string]any
}

type SecurityEvent struct {
	ID           uuid.UUID `json:"id"`
	EventType    string    `json:"event_type"`
	Outcome      string    `json:"outcome"`
	IPAddress    *string   `json:"ip_address,omitempty"`
	UserAgent    *string   `json:"user_agent,omitempty"`
	MetadataJSON []byte    `json:"metadata_json"`
	OccurredAt   time.Time `json:"occurred_at"`
}

func (s *Service) HasActiveMFA(ctx context.Context, userID uuid.UUID) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		select exists(
			select 1 from user_mfa_methods
			where user_id = $1 and method = 'totp' and status = 'active'
		)
	`, userID).Scan(&ok)
	return ok, err
}

func (s *Service) GetMFAStatus(ctx context.Context, userID uuid.UUID) (*MFAStatus, error) {
	enabled, err := s.HasActiveMFA(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &MFAStatus{Enabled: enabled}, nil
}

func (s *Service) BeginMFAEnroll(ctx context.Context, userID uuid.UUID, email string) (*MFAEnrollResult, error) {
	if len(s.secrets) != 32 {
		return nil, domainerr.New(503, "secrets_unavailable", "Service Unavailable", "MFA is not configured on this server")
	}
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Nexus",
		AccountName: email,
	})
	if err != nil {
		return nil, err
	}
	encrypted, err := crypto.Encrypt(s.secrets, []byte(key.Secret()))
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		insert into user_mfa_methods (id, user_id, method, secret_encrypted, status, created_at)
		values ($1,$2,'totp',$3,'pending',$4)
		on conflict (user_id, method) do update
		set secret_encrypted = excluded.secret_encrypted,
		    status = 'pending',
		    confirmed_at = null,
		    disabled_at = null,
		    created_at = excluded.created_at
	`, ids.New(), userID, encrypted, now)
	if err != nil {
		return nil, err
	}
	return &MFAEnrollResult{Secret: key.Secret(), OTPAuthURL: key.URL()}, nil
}

func (s *Service) ConfirmMFAEnroll(ctx context.Context, userID uuid.UUID, code string) ([]string, error) {
	var methodID uuid.UUID
	var encrypted string
	err := s.pool.QueryRow(ctx, `
		select id, secret_encrypted from user_mfa_methods
		where user_id = $1 and method = 'totp' and status = 'pending'
	`, userID).Scan(&methodID, &encrypted)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.Validation("mfa_enroll_required", "Start MFA enrollment first")
	}
	if err != nil {
		return nil, err
	}
	secretBytes, err := crypto.Decrypt(s.secrets, encrypted)
	if err != nil {
		return nil, err
	}
	if !totp.Validate(strings.TrimSpace(code), string(secretBytes)) {
		return nil, domainerr.Validation("invalid_mfa_code", "Invalid authentication code")
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		update user_mfa_methods set status = 'active', confirmed_at = $2 where id = $1
	`, methodID, now)
	if err != nil {
		return nil, err
	}
	codes, err := s.replaceRecoveryCodes(ctx, userID)
	if err != nil {
		return nil, err
	}
	_ = s.RecordAuthEvent(ctx, AuthEventInput{
		UserID: &userID, EventType: "mfa.enabled", Outcome: "success",
	})
	return codes, nil
}

func (s *Service) DisableMFA(ctx context.Context, userID uuid.UUID, password, code string) error {
	var hash *string
	err := s.pool.QueryRow(ctx, `
		select password_hash from users where id = $1 and deleted_at is null
	`, userID).Scan(&hash)
	if err != nil {
		return err
	}
	if hash == nil || !crypto.VerifyPassword(*hash, password) {
		return domainerr.Unauthorized("Invalid password")
	}
	ok, err := s.VerifyMFACode(ctx, userID, code)
	if err != nil {
		return err
	}
	if !ok {
		return domainerr.Validation("invalid_mfa_code", "Invalid authentication code")
	}
	now := time.Now().UTC()
	_, err = s.pool.Exec(ctx, `
		update user_mfa_methods set status = 'disabled', disabled_at = $2
		where user_id = $1 and method = 'totp' and status = 'active'
	`, userID, now)
	if err != nil {
		return err
	}
	_, _ = s.pool.Exec(ctx, `delete from user_mfa_recovery_codes where user_id = $1`, userID)
	_ = s.RecordAuthEvent(ctx, AuthEventInput{
		UserID: &userID, EventType: "mfa.disabled", Outcome: "success",
	})
	return nil
}

func (s *Service) RegenerateRecoveryCodes(ctx context.Context, userID uuid.UUID, password string) ([]string, error) {
	var hash *string
	err := s.pool.QueryRow(ctx, `
		select password_hash from users where id = $1 and deleted_at is null
	`, userID).Scan(&hash)
	if err != nil {
		return nil, err
	}
	if hash == nil || !crypto.VerifyPassword(*hash, password) {
		return nil, domainerr.Unauthorized("Invalid password")
	}
	enabled, err := s.HasActiveMFA(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !enabled {
		return nil, domainerr.Validation("mfa_not_enabled", "MFA is not enabled")
	}
	return s.replaceRecoveryCodes(ctx, userID)
}

func (s *Service) replaceRecoveryCodes(ctx context.Context, userID uuid.UUID) ([]string, error) {
	_, err := s.pool.Exec(ctx, `delete from user_mfa_recovery_codes where user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	codes := make([]string, 0, 10)
	now := time.Now().UTC()
	for i := 0; i < 10; i++ {
		raw, err := crypto.RandomToken(8)
		if err != nil {
			return nil, err
		}
		code := strings.ToUpper(raw)
		if len(code) > 10 {
			code = code[:10]
		}
		codes = append(codes, code)
		_, err = s.pool.Exec(ctx, `
			insert into user_mfa_recovery_codes (id, user_id, code_hash, created_at)
			values ($1,$2,$3,$4)
		`, ids.New(), userID, crypto.HashToken(code), now)
		if err != nil {
			return nil, err
		}
	}
	return codes, nil
}

func (s *Service) VerifyMFACode(ctx context.Context, userID uuid.UUID, code string) (bool, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return false, nil
	}
	var encrypted string
	err := s.pool.QueryRow(ctx, `
		select secret_encrypted from user_mfa_methods
		where user_id = $1 and method = 'totp' and status = 'active'
	`, userID).Scan(&encrypted)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	secretBytes, err := crypto.Decrypt(s.secrets, encrypted)
	if err != nil {
		return false, err
	}
	if totp.Validate(code, string(secretBytes)) {
		return true, nil
	}
	hash := crypto.HashToken(strings.ToUpper(code))
	var codeID uuid.UUID
	err = s.pool.QueryRow(ctx, `
		select id from user_mfa_recovery_codes
		where user_id = $1 and code_hash = $2 and used_at is null
	`, userID, hash).Scan(&codeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	_, err = s.pool.Exec(ctx, `update user_mfa_recovery_codes set used_at = now() where id = $1`, codeID)
	return err == nil, err
}

func (s *Service) CreateMFAChallenge(ctx context.Context, userID uuid.UUID, organizationID *uuid.UUID) (token string, expiresAt time.Time, err error) {
	token, err = crypto.RandomToken(32)
	if err != nil {
		return "", time.Time{}, err
	}
	expiresAt = time.Now().UTC().Add(5 * time.Minute)
	_, err = s.pool.Exec(ctx, `
		insert into authentication_challenges (
			id, user_id, organization_id, challenge_type, token_hash, expires_at, created_at
		) values ($1,$2,$3,'login_mfa',$4,$5,now())
	`, ids.New(), userID, organizationID, crypto.HashToken(token), expiresAt)
	return token, expiresAt, err
}

func (s *Service) ConsumeMFAChallenge(ctx context.Context, token, code string) (userID uuid.UUID, organizationID *uuid.UUID, err error) {
	hash := crypto.HashToken(strings.TrimSpace(token))
	now := time.Now().UTC()
	var challengeID uuid.UUID
	err = s.pool.QueryRow(ctx, `
		select id, user_id, organization_id from authentication_challenges
		where token_hash = $1 and challenge_type = 'login_mfa'
		  and consumed_at is null and expires_at > $2
	`, hash, now).Scan(&challengeID, &userID, &organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil, domainerr.Unauthorized("Invalid or expired MFA challenge")
	}
	if err != nil {
		return uuid.Nil, nil, err
	}
	ok, err := s.VerifyMFACode(ctx, userID, code)
	if err != nil {
		return uuid.Nil, nil, err
	}
	if !ok {
		return uuid.Nil, nil, domainerr.Unauthorized("Invalid authentication code")
	}
	_, err = s.pool.Exec(ctx, `update authentication_challenges set consumed_at = $2 where id = $1`, challengeID, now)
	return userID, organizationID, err
}

func (s *Service) RecordAuthEvent(ctx context.Context, in AuthEventInput) error {
	if s == nil || s.pool == nil {
		return nil
	}
	meta := []byte("{}")
	if in.Metadata != nil {
		if b, err := json.Marshal(in.Metadata); err == nil {
			meta = b
		}
	}
	var ip any
	if strings.TrimSpace(in.IPAddress) != "" {
		ip = in.IPAddress
	}
	var ua *string
	if v := strings.TrimSpace(in.UserAgent); v != "" {
		ua = &v
	}
	_, err := s.pool.Exec(ctx, `
		insert into authentication_events (
			id, user_id, organization_id, event_type, outcome, ip_address, user_agent, metadata_json, occurred_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,now())
	`, ids.New(), in.UserID, in.OrganizationID, in.EventType, in.Outcome, ip, ua, meta)
	return err
}

func (s *Service) ListSecurityEvents(ctx context.Context, userID uuid.UUID, limit int) ([]SecurityEvent, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := s.pool.Query(ctx, `
		select id, event_type, outcome, host(ip_address)::text, user_agent, metadata_json, occurred_at
		from authentication_events
		where user_id = $1
		   or (
		     event_type = 'login.failure'
		     and metadata_json->>'email' = (select email_normalized from users where id = $1)
		   )
		order by occurred_at desc
		limit $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SecurityEvent
	for rows.Next() {
		var e SecurityEvent
		if err := rows.Scan(&e.ID, &e.EventType, &e.Outcome, &e.IPAddress, &e.UserAgent, &e.MetadataJSON, &e.OccurredAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}
