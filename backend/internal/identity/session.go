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
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type Session struct {
	ID              uuid.UUID  `json:"id"`
	UserID          uuid.UUID  `json:"user_id"`
	DeviceLabel     *string    `json:"device_label,omitempty"`
	UserAgent       *string    `json:"user_agent,omitempty"`
	IPAddress       *string    `json:"ip_address,omitempty"`
	ExpiresAt       time.Time  `json:"expires_at"`
	LastSeenAt      time.Time  `json:"last_seen_at"`
	RevokedAt       *time.Time `json:"revoked_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	Current         bool       `json:"current"`
	RememberBrowser bool       `json:"-"`
}

type CreateSessionInput struct {
	UserID          uuid.UUID
	UserAgent       string
	IPAddress       string
	AbsoluteTTL     time.Duration
	RememberBrowser bool
}

type CreatedSession struct {
	Session      Session
	RefreshToken string
	JTI          string
}

func deviceLabelFromUA(ua string) string {
	ua = strings.TrimSpace(ua)
	if ua == "" {
		return "Sessão desconhecida"
	}
	lower := strings.ToLower(ua)
	switch {
	case strings.Contains(lower, "edg/"):
		return "Edge"
	case strings.Contains(lower, "chrome/"):
		return "Chrome"
	case strings.Contains(lower, "firefox/"):
		return "Firefox"
	case strings.Contains(lower, "safari/") && !strings.Contains(lower, "chrome"):
		return "Safari"
	default:
		if len(ua) > 48 {
			return ua[:48] + "…"
		}
		return ua
	}
}

func (s *Service) CreateSession(ctx context.Context, in CreateSessionInput) (*CreatedSession, error) {
	if in.UserID == uuid.Nil {
		return nil, domainerr.Validation("invalid_user_id", "user_id is required")
	}
	ttl := in.AbsoluteTTL
	if ttl <= 0 {
		ttl = 8 * time.Hour
	}
	refresh, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	sessionID := ids.New()
	jti := uuid.NewString()
	label := deviceLabelFromUA(in.UserAgent)
	var ua *string
	if strings.TrimSpace(in.UserAgent) != "" {
		v := strings.TrimSpace(in.UserAgent)
		ua = &v
	}
	var ip *string
	if ipAddr := net.ParseIP(strings.TrimSpace(in.IPAddress)); ipAddr != nil {
		v := ipAddr.String()
		ip = &v
	}
	_, err = s.pool.Exec(ctx, `
		insert into user_sessions (
			id, user_id, refresh_token_hash, user_agent, ip_address, expires_at, created_at, jti, device_label, last_seen_at, remember_browser
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$7,$10)
	`, sessionID, in.UserID, crypto.HashToken(refresh), ua, ip, now.Add(ttl), now, jti, label, in.RememberBrowser)
	if err != nil {
		return nil, err
	}
	_, _ = s.pool.Exec(ctx, `update users set last_login_at = $1, updated_at = $1 where id = $2`, now, in.UserID)
	return &CreatedSession{
		Session: Session{
			ID: sessionID, UserID: in.UserID, DeviceLabel: &label, UserAgent: ua, IPAddress: ip,
			ExpiresAt: now.Add(ttl), LastSeenAt: now, CreatedAt: now, Current: true, RememberBrowser: in.RememberBrowser,
		},
		RefreshToken: refresh,
		JTI:          jti,
	}, nil
}

func (s *Service) ListSessions(ctx context.Context, userID, currentSessionID uuid.UUID) ([]Session, error) {
	rows, err := s.pool.Query(ctx, `
		select id, user_id, device_label, user_agent, host(ip_address)::text, expires_at, last_seen_at, revoked_at, created_at
		from user_sessions
		where user_id = $1
		order by created_at desc
		limit 50
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Session
	for rows.Next() {
		var sess Session
		if err := rows.Scan(
			&sess.ID, &sess.UserID, &sess.DeviceLabel, &sess.UserAgent, &sess.IPAddress,
			&sess.ExpiresAt, &sess.LastSeenAt, &sess.RevokedAt, &sess.CreatedAt,
		); err != nil {
			return nil, err
		}
		sess.Current = sess.ID == currentSessionID && sess.RevokedAt == nil
		out = append(out, sess)
	}
	return out, nil
}

func (s *Service) RevokeSession(ctx context.Context, userID, sessionID uuid.UUID) error {
	now := time.Now().UTC()
	tag, err := s.pool.Exec(ctx, `
		update user_sessions set revoked_at = $3
		where id = $1 and user_id = $2 and revoked_at is null
	`, sessionID, userID, now)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domainerr.NotFound("session_not_found", "Session not found")
	}
	_ = s.RecordAuthEvent(ctx, AuthEventInput{
		UserID: &userID, EventType: "session.revoked", Outcome: "success",
		Metadata: map[string]any{"session_id": sessionID},
	})
	return nil
}

func (s *Service) RevokeOtherSessions(ctx context.Context, userID, keepSessionID uuid.UUID) (int64, error) {
	now := time.Now().UTC()
	tag, err := s.pool.Exec(ctx, `
		update user_sessions set revoked_at = $3
		where user_id = $1 and id <> $2 and revoked_at is null
	`, userID, keepSessionID, now)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (s *Service) RefreshSession(ctx context.Context, refreshToken string, idleTimeout, absoluteTTL time.Duration) (*CreatedSession, error) {
	token := strings.TrimSpace(refreshToken)
	if token == "" {
		return nil, domainerr.Unauthorized("Invalid refresh token")
	}
	hash := crypto.HashToken(token)
	now := time.Now().UTC()
	var sess Session
	var jti string
	err := s.pool.QueryRow(ctx, `
		select id, user_id, device_label, user_agent, host(ip_address)::text, expires_at, last_seen_at, revoked_at, created_at, coalesce(jti, ''), coalesce(remember_browser, false)
		from user_sessions where refresh_token_hash = $1
	`, hash).Scan(
		&sess.ID, &sess.UserID, &sess.DeviceLabel, &sess.UserAgent, &sess.IPAddress,
		&sess.ExpiresAt, &sess.LastSeenAt, &sess.RevokedAt, &sess.CreatedAt, &jti, &sess.RememberBrowser,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domainerr.Unauthorized("Invalid refresh token")
	}
	if err != nil {
		return nil, err
	}
	if sess.RevokedAt != nil {
		return nil, domainerr.Unauthorized("Session revoked")
	}
	if now.After(sess.ExpiresAt) {
		return nil, domainerr.Unauthorized("Session expired")
	}
	if !sess.RememberBrowser && idleTimeout > 0 && now.After(sess.LastSeenAt.Add(idleTimeout)) {
		_, _ = s.pool.Exec(ctx, `update user_sessions set revoked_at = $2 where id = $1`, sess.ID, now)
		return nil, domainerr.Unauthorized("Session idle timeout")
	}
	newRefresh, err := crypto.RandomToken(32)
	if err != nil {
		return nil, err
	}
	newJTI := uuid.NewString()
	exp := sess.ExpiresAt
	if absoluteTTL > 0 {
		cap := sess.CreatedAt.Add(absoluteTTL)
		if cap.Before(exp) {
			exp = cap
		}
	}
	_, err = s.pool.Exec(ctx, `
		update user_sessions
		set refresh_token_hash = $2, jti = $3, last_seen_at = $4, expires_at = $5
		where id = $1
	`, sess.ID, crypto.HashToken(newRefresh), newJTI, now, exp)
	if err != nil {
		return nil, err
	}
	sess.ExpiresAt = exp
	sess.LastSeenAt = now
	sess.Current = true
	return &CreatedSession{Session: sess, RefreshToken: newRefresh, JTI: newJTI}, nil
}

func (s *Service) EnsureSessionActive(ctx context.Context, sessionID, userID uuid.UUID, idleTimeout time.Duration) error {
	if sessionID == uuid.Nil {
		return nil
	}
	now := time.Now().UTC()
	var expiresAt, lastSeen time.Time
	var revokedAt *time.Time
	var remember bool
	err := s.pool.QueryRow(ctx, `
		select expires_at, last_seen_at, revoked_at, coalesce(remember_browser, false) from user_sessions
		where id = $1 and user_id = $2
	`, sessionID, userID).Scan(&expiresAt, &lastSeen, &revokedAt, &remember)
	if errors.Is(err, pgx.ErrNoRows) {
		return domainerr.Unauthorized("Session not found")
	}
	if err != nil {
		return err
	}
	if revokedAt != nil {
		return domainerr.Unauthorized("Session revoked")
	}
	if now.After(expiresAt) {
		return domainerr.Unauthorized("Session expired")
	}
	if !remember && idleTimeout > 0 && now.After(lastSeen.Add(idleTimeout)) {
		_, _ = s.pool.Exec(ctx, `update user_sessions set revoked_at = $2 where id = $1`, sessionID, now)
		return domainerr.Unauthorized("Session idle timeout")
	}
	if now.Sub(lastSeen) > time.Minute {
		_, _ = s.pool.Exec(ctx, `update user_sessions set last_seen_at = $2 where id = $1`, sessionID, now)
	}
	return nil
}
