package identity

import (
	"context"
	"errors"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/crypto"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

const TrustedDeviceTTL = 30 * 24 * time.Hour

func (s *Service) CreateTrustedDevice(ctx context.Context, userID uuid.UUID, userAgent, ipAddress string, ttl time.Duration) (string, error) {
	if ttl <= 0 {
		ttl = TrustedDeviceTTL
	}
	raw, err := crypto.RandomToken(32)
	if err != nil {
		return "", err
	}
	now := time.Now().UTC()
	var ua *string
	if v := strings.TrimSpace(userAgent); v != "" {
		ua = &v
	}
	var ip *string
	if parsed := net.ParseIP(strings.TrimSpace(ipAddress)); parsed != nil {
		v := parsed.String()
		ip = &v
	}
	id := ids.New()
	hash := crypto.HashToken(raw)
	expires := now.Add(ttl)
	_, err = s.pool.Exec(ctx, `
		insert into user_trusted_devices (
			id, user_id, token_hash, user_agent, ip_address, expires_at, last_used_at, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$7)
	`, id, userID, hash, ua, ip, expires, now)
	if err != nil && ip != nil {
		_, err = s.pool.Exec(ctx, `
			insert into user_trusted_devices (
				id, user_id, token_hash, user_agent, ip_address, expires_at, last_used_at, created_at
			) values ($1,$2,$3,$4,$5,$6,$7,$7)
		`, id, userID, hash, ua, nil, expires, now)
	}
	if err != nil {
		return "", err
	}
	return raw, nil
}

// EnsureTrustedDevice reuses a still-valid cookie instead of rotating it.
// Rotation would drop the previous cookie if the new Set-Cookie failed to stick.
func (s *Service) EnsureTrustedDevice(ctx context.Context, userID uuid.UUID, existingRaw, userAgent, ipAddress string, ttl time.Duration) (string, error) {
	if existingRaw != "" {
		ok, err := s.LookupTrustedDevice(ctx, userID, existingRaw)
		if err != nil {
			return "", err
		}
		if ok {
			return existingRaw, nil
		}
	}
	return s.CreateTrustedDevice(ctx, userID, userAgent, ipAddress, ttl)
}

func (s *Service) LookupTrustedDevice(ctx context.Context, userID uuid.UUID, rawToken string) (bool, error) {
	token := strings.TrimSpace(rawToken)
	if token == "" || userID == uuid.Nil {
		return false, nil
	}
	now := time.Now().UTC()
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		select id from user_trusted_devices
		where user_id = $1 and token_hash = $2 and expires_at > $3
	`, userID, crypto.HashToken(token), now).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	_, _ = s.pool.Exec(ctx, `update user_trusted_devices set last_used_at = $2 where id = $1`, id, now)
	return true, nil
}
