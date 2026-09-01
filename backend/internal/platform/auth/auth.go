package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

type TokenKind string

const (
	TokenKindUser   TokenKind = "user"
	TokenKindClient TokenKind = "client"

	PurposeMFASetup = "mfa_setup"
)

type Claims struct {
	Kind           TokenKind  `json:"kind"`
	UserID         *uuid.UUID `json:"user_id,omitempty"`
	OrganizationID *uuid.UUID `json:"organization_id,omitempty"`
	SessionID      *uuid.UUID `json:"session_id,omitempty"`
	Purpose        string     `json:"purpose,omitempty"`
	ClientID       string     `json:"client_id,omitempty"`
	SourceSystem   string     `json:"source_system,omitempty"`
	Scopes         []string   `json:"scopes,omitempty"`
	PlatformRole   string     `json:"platform_role,omitempty"`
	jwt.RegisteredClaims
}

type Principal struct {
	Kind           TokenKind
	UserID         uuid.UUID
	OrganizationID uuid.UUID
	SessionID      uuid.UUID
	Purpose        string
	ClientID       string
	SourceSystem   string
	Scopes         []string
	PlatformRole   string
}

type TokenService struct {
	secret []byte
	issuer string
	access time.Duration
	client time.Duration
}

type IssueUserTokenInput struct {
	UserID         uuid.UUID
	PlatformRole   string
	OrganizationID *uuid.UUID
	SessionID      *uuid.UUID
	Purpose        string
	TTL            time.Duration
	JTI            string
}

func NewTokenService(secret, issuer string, accessTTL, clientTTL time.Duration) *TokenService {
	return &TokenService{
		secret: []byte(secret),
		issuer: issuer,
		access: accessTTL,
		client: clientTTL,
	}
}

func (s *TokenService) AccessTTL() time.Duration {
	return s.access
}

func (s *TokenService) IssueUserToken(userID uuid.UUID, platformRole string, organizationID *uuid.UUID) (string, time.Time, error) {
	return s.IssueUserTokenEx(IssueUserTokenInput{
		UserID: userID, PlatformRole: platformRole, OrganizationID: organizationID,
	})
}

func (s *TokenService) IssueUserTokenEx(in IssueUserTokenInput) (string, time.Time, error) {
	ttl := in.TTL
	if ttl <= 0 {
		ttl = s.access
	}
	exp := time.Now().UTC().Add(ttl)
	jti := in.JTI
	if jti == "" {
		jti = uuid.NewString()
	}
	claims := Claims{
		Kind:           TokenKindUser,
		UserID:         &in.UserID,
		OrganizationID: in.OrganizationID,
		SessionID:      in.SessionID,
		Purpose:        in.Purpose,
		PlatformRole:   in.PlatformRole,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   in.UserID.String(),
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ID:        jti,
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	return signed, exp, err
}

func (s *TokenService) IssueClientToken(organizationID uuid.UUID, clientID, sourceSystem string, scopes []string) (string, time.Time, error) {
	exp := time.Now().UTC().Add(s.client)
	claims := Claims{
		Kind:           TokenKindClient,
		OrganizationID: &organizationID,
		ClientID:       clientID,
		SourceSystem:   sourceSystem,
		Scopes:         scopes,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   clientID,
			Audience:  []string{"inbound_api"},
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	return signed, exp, err
}

func (s *TokenService) Parse(raw string) (*Principal, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}

	p := &Principal{
		Kind:         claims.Kind,
		ClientID:     claims.ClientID,
		SourceSystem: claims.SourceSystem,
		Scopes:       claims.Scopes,
		PlatformRole: claims.PlatformRole,
		Purpose:      claims.Purpose,
	}
	if claims.UserID != nil {
		p.UserID = *claims.UserID
	}
	if claims.OrganizationID != nil {
		p.OrganizationID = *claims.OrganizationID
	}
	if claims.SessionID != nil {
		p.SessionID = *claims.SessionID
	}
	return p, nil
}

type principalKey struct{}

func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

func PrincipalFrom(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(*Principal)
	return p, ok
}

func tokenFromRequest(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	}
	return httpx.CookieValue(r, httpx.AccessCookieName)
}

func Middleware(tokens *TokenService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := tokenFromRequest(r)
			if raw == "" {
				httpx.WriteProblem(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", "Missing access token", httpx.TraceIDFrom(r.Context()))
				return
			}
			principal, err := tokens.Parse(raw)
			if err != nil {
				httpx.WriteProblem(w, http.StatusUnauthorized, "unauthorized", "Unauthorized", "Invalid access token", httpx.TraceIDFrom(r.Context()))
				return
			}
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), principal)))
		})
	}
}

func RequireClient(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := PrincipalFrom(r.Context())
		if !ok || p.Kind != TokenKindClient || p.OrganizationID == uuid.Nil {
			httpx.WriteProblem(w, http.StatusForbidden, "forbidden", "Forbidden", "Client credentials required", httpx.TraceIDFrom(r.Context()))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := PrincipalFrom(r.Context())
		if !ok || p.Kind != TokenKindUser || p.UserID == uuid.Nil {
			httpx.WriteProblem(w, http.StatusForbidden, "forbidden", "Forbidden", "User session required", httpx.TraceIDFrom(r.Context()))
			return
		}
		next.ServeHTTP(w, r)
	})
}

func HasScope(p *Principal, scope string) bool {
	for _, s := range p.Scopes {
		if s == scope || s == "*" {
			return true
		}
	}
	return false
}

func HasAnyScope(p *Principal, scopes ...string) bool {
	for _, scope := range scopes {
		if HasScope(p, scope) {
			return true
		}
	}
	return false
}
