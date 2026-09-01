package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/auth"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/httpx"
)

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func (a *ControlPlane) sessionGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := auth.PrincipalFrom(r.Context())
		if !ok {
			writeErr(w, r, domainerr.Forbidden("User session required"))
			return
		}
		path := r.URL.Path
		if p.Purpose == auth.PurposeMFASetup {
			allowed := strings.HasPrefix(path, "/v1/users/me/mfa") ||
				path == "/v1/users/me" ||
				path == "/v1/users/me/avatar" ||
				strings.HasPrefix(path, "/v1/organizations/") && strings.HasSuffix(path, "/authentication_settings")
			if !allowed {
				writeErr(w, r, domainerr.New(403, "mfa_setup_required", "Forbidden", "Complete MFA setup before continuing"))
				return
			}
		}
		if p.SessionID != uuid.Nil {
			idle := 30 * time.Minute
			if p.OrganizationID != uuid.Nil {
				if settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), p.OrganizationID); err == nil {
					idle = time.Duration(settings.SessionIdleTimeoutMinutes) * time.Minute
					if settings.AccessLocked {
						canUnlock := p.PlatformRole == identity.PlatformRoleAdmin ||
							p.PlatformRole == identity.PlatformRoleSystem ||
							p.PlatformRole == identity.PlatformRoleSupport
						if !canUnlock {
							ok, _ := a.Orgs.MemberHasPermission(r.Context(), p.OrganizationID, p.UserID, "organization:update")
							canUnlock = ok
						}
						if !canUnlock {
							msg := "Sistema em manutenção"
							if settings.AccessLockMessage != nil && *settings.AccessLockMessage != "" {
								msg = *settings.AccessLockMessage
							}
							writeErr(w, r, domainerr.New(403, "access_locked", "Forbidden", msg))
							return
						}
					}
					if settings.MFARequired && p.Purpose != auth.PurposeMFASetup {
						enabled, _ := a.Identity.HasActiveMFA(r.Context(), p.UserID)
						if !enabled && !strings.HasPrefix(path, "/v1/users/me/mfa") && path != "/v1/users/me" {
							writeErr(w, r, domainerr.New(403, "mfa_setup_required", "Forbidden", "MFA setup is required by your organization"))
							return
						}
					}
				}
			}
			if err := a.Identity.EnsureSessionActive(r.Context(), p.SessionID, p.UserID, idle); err != nil {
				writeErr(w, r, err)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type loginStep int

const (
	loginStepSession loginStep = iota
	loginStepMFAChallenge
	loginStepMFASetup
)

// loginAfterPassword decides what happens after a valid password.
// MFA challenge is only for enrolled users on an unknown browser.
// Org-mandated setup applies only when the user has not enrolled MFA yet.
func loginAfterPassword(mfaEnabled, trustedDevice, orgRequiresMFA bool) loginStep {
	if mfaEnabled && !trustedDevice {
		return loginStepMFAChallenge
	}
	if orgRequiresMFA && !mfaEnabled {
		return loginStepMFASetup
	}
	return loginStepSession
}

func (a *ControlPlane) hasTrustedDevice(r *http.Request, userID uuid.UUID) bool {
	raw := httpx.CookieValue(r, httpx.DeviceCookieName)
	ok, err := a.Identity.LookupTrustedDevice(r.Context(), userID, raw)
	return err == nil && ok
}

func (a *ControlPlane) persistTrustedDevice(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	existing := httpx.CookieValue(r, httpx.DeviceCookieName)
	device, err := a.Identity.EnsureTrustedDevice(r.Context(), userID, existing, r.UserAgent(), clientIP(r), identity.TrustedDeviceTTL)
	if err != nil {
		slog.Error("trusted device cookie was not saved", "user_id", userID, "error", err)
		return
	}
	httpx.SetDeviceCookie(w, r, device, identity.TrustedDeviceTTL)
}

func (a *ControlPlane) writeMFAChallenge(w http.ResponseWriter, r *http.Request, userID uuid.UUID, orgID *uuid.UUID) {
	challenge, exp, err := a.Identity.CreateMFAChallenge(r.Context(), userID, orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.SetMFAChallengeCookie(w, r, challenge, 5*time.Minute)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"mfa_required": true,
		"expires_at":   exp,
	})
}

func sessionTTL(absolute time.Duration, remember bool) time.Duration {
	if remember && absolute < identity.TrustedDeviceTTL {
		return identity.TrustedDeviceTTL
	}
	if absolute <= 0 {
		return 8 * time.Hour
	}
	return absolute
}

func (a *ControlPlane) writeAuthCookies(w http.ResponseWriter, r *http.Request, access, refresh string, remember bool, absolute time.Duration) {
	httpx.SetAccessCookie(w, r, access, a.Tokens.AccessTTL())
	if refresh != "" {
		httpx.SetRefreshCookie(w, r, refresh, sessionTTL(absolute, remember))
	}
	httpx.SetMFAChallengeCookie(w, r, "", -time.Second)
}

func (a *ControlPlane) issueLoginTokens(w http.ResponseWriter, r *http.Request, user *identity.User, orgID *uuid.UUID, purpose string, remember, trustDevice bool) {
	absolute := 8 * time.Hour
	if orgID != nil {
		if settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), *orgID); err == nil {
			absolute = time.Duration(settings.SessionAbsoluteTimeoutMinutes) * time.Minute
		}
	}
	absolute = sessionTTL(absolute, remember)
	var sessionID *uuid.UUID
	var refresh string
	var jti string
	if purpose == "" {
		created, err := a.Identity.CreateSession(r.Context(), identity.CreateSessionInput{
			UserID: user.ID, UserAgent: r.UserAgent(), IPAddress: clientIP(r), AbsoluteTTL: absolute, RememberBrowser: remember,
		})
		if err != nil {
			writeErr(w, r, err)
			return
		}
		sessionID = &created.Session.ID
		refresh = created.RefreshToken
		jti = created.JTI
	}
	token, exp, err := a.Tokens.IssueUserTokenEx(auth.IssueUserTokenInput{
		UserID: user.ID, PlatformRole: user.PlatformRole, OrganizationID: orgID,
		SessionID: sessionID, Purpose: purpose, JTI: jti,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	_ = a.Identity.RecordAuthEvent(r.Context(), identity.AuthEventInput{
		UserID: &user.ID, OrganizationID: orgID, EventType: "login.success", Outcome: "success",
		IPAddress: clientIP(r), UserAgent: r.UserAgent(),
	})
	a.writeAuthCookies(w, r, token, refresh, remember, absolute)
	if purpose == "" && (trustDevice || a.hasTrustedDevice(r, user.ID)) {
		a.persistTrustedDevice(w, r, user.ID)
	}
	body := map[string]any{
		"user":            user,
		"organization_id": orgID,
		"expires_at":      exp,
		"token_type":      "Bearer",
	}
	if purpose == auth.PurposeMFASetup {
		body["mfa_setup_required"] = true
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

func (a *ControlPlane) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email           string `json:"email"`
		Password        string `json:"password"`
		OrganizationID  string `json:"organization_id"`
		RememberBrowser bool   `json:"remember_browser"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Identity.EnsureLoginAllowed(r.Context(), body.Email); err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Identity.Authenticate(r.Context(), body.Email, body.Password)
	if err != nil {
		_ = a.Identity.RecordLoginFailure(r.Context(), body.Email)
		failure := identity.AuthEventInput{
			EventType: "login.failure", Outcome: "failure",
			IPAddress: clientIP(r), UserAgent: r.UserAgent(),
			Metadata: map[string]any{"email": identity.NormalizeEmail(body.Email)},
		}
		if existing, lookupErr := a.Identity.GetByEmail(r.Context(), body.Email); lookupErr == nil {
			failure.UserID = &existing.ID
		}
		_ = a.Identity.RecordAuthEvent(r.Context(), failure)
		writeErr(w, r, err)
		return
	}
	_ = a.Identity.ClearLoginFailures(r.Context(), body.Email)

	var orgID *uuid.UUID
	if user.PlatformRole == identity.PlatformRoleMember {
		if body.OrganizationID != "" {
			writeErr(w, r, domainerr.Validation("organization_not_allowed", "organization_id cannot be informed for member users"))
			return
		}
		id, err := a.Orgs.ResolveUserOrganization(r.Context(), user.ID)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		orgID = &id
	} else if body.OrganizationID != "" {
		id, err := uuid.Parse(body.OrganizationID)
		if err != nil {
			writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
			return
		}
		if err := a.Orgs.EnsureActiveOrganization(r.Context(), id); err != nil {
			writeErr(w, r, err)
			return
		}
		orgID = &id
	}

	if orgID != nil {
		settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), *orgID)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		if settings.AccessLocked {
			canUnlock := user.PlatformRole == identity.PlatformRoleAdmin ||
				user.PlatformRole == identity.PlatformRoleSystem ||
				user.PlatformRole == identity.PlatformRoleSupport
			if !canUnlock {
				ok, _ := a.Orgs.MemberHasPermission(r.Context(), *orgID, user.ID, "organization:update")
				canUnlock = ok
			}
			if !canUnlock {
				msg := "Sistema em manutenção"
				if settings.AccessLockMessage != nil && *settings.AccessLockMessage != "" {
					msg = *settings.AccessLockMessage
				}
				writeErr(w, r, domainerr.New(403, "access_locked", "Forbidden", msg))
				return
			}
		}
		enabled, err := a.Identity.HasActiveMFA(r.Context(), user.ID)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		switch loginAfterPassword(enabled, a.hasTrustedDevice(r, user.ID), settings.MFARequired) {
		case loginStepMFAChallenge:
			a.writeMFAChallenge(w, r, user.ID, orgID)
			return
		case loginStepMFASetup:
			full, _ := a.Identity.GetByID(r.Context(), user.ID)
			if full != nil {
				user = full
			}
			a.issueLoginTokens(w, r, user, orgID, auth.PurposeMFASetup, body.RememberBrowser, false)
			return
		}
	} else {
		enabled, err := a.Identity.HasActiveMFA(r.Context(), user.ID)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		if loginAfterPassword(enabled, a.hasTrustedDevice(r, user.ID), false) == loginStepMFAChallenge {
			a.writeMFAChallenge(w, r, user.ID, nil)
			return
		}
	}

	full, _ := a.Identity.GetByID(r.Context(), user.ID)
	if full != nil {
		user = full
	}
	a.issueLoginTokens(w, r, user, orgID, "", body.RememberBrowser, false)
}

func (a *ControlPlane) verifyMFALogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChallengeToken  string `json:"challenge_token"`
		Code            string `json:"code"`
		RememberBrowser bool   `json:"remember_browser"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	challenge := strings.TrimSpace(body.ChallengeToken)
	if challenge == "" {
		challenge = httpx.CookieValue(r, httpx.MFAChallengeCookieName)
	}
	userID, orgID, err := a.Identity.ConsumeMFAChallenge(r.Context(), challenge, body.Code)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Identity.GetByID(r.Context(), userID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	a.issueLoginTokens(w, r, user, orgID, "", body.RememberBrowser, true)
}

func (a *ControlPlane) refreshToken(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	refresh := httpx.CookieValue(r, httpx.RefreshCookieName)
	if err := httpx.DecodeJSON(r, &body); err == nil && strings.TrimSpace(body.RefreshToken) != "" {
		refresh = strings.TrimSpace(body.RefreshToken)
	}
	if refresh == "" {
		writeErr(w, r, domainerr.Unauthorized("Missing refresh token"))
		return
	}
	idle := 30 * time.Minute
	absolute := 8 * time.Hour
	created, err := a.Identity.RefreshSession(r.Context(), refresh, idle, absolute)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Identity.GetByID(r.Context(), created.Session.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	var orgID *uuid.UUID
	if user.PlatformRole == identity.PlatformRoleMember {
		id, err := a.Orgs.ResolveUserOrganization(r.Context(), user.ID)
		if err == nil {
			orgID = &id
			if settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), id); err == nil {
				idle = time.Duration(settings.SessionIdleTimeoutMinutes) * time.Minute
				absolute = time.Duration(settings.SessionAbsoluteTimeoutMinutes) * time.Minute
				_ = idle
			}
		}
	}
	if created.Session.RememberBrowser {
		absolute = sessionTTL(absolute, true)
	}
	token, exp, err := a.Tokens.IssueUserTokenEx(auth.IssueUserTokenInput{
		UserID: user.ID, PlatformRole: user.PlatformRole, OrganizationID: orgID,
		SessionID: &created.Session.ID, JTI: created.JTI,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	a.writeAuthCookies(w, r, token, created.RefreshToken, created.Session.RememberBrowser, absolute)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"user":            user,
		"organization_id": orgID,
		"token_type":      "Bearer",
		"expires_at":      exp,
	})
}

func (a *ControlPlane) logout(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if p.SessionID != uuid.Nil {
		_ = a.Identity.RevokeSession(r.Context(), p.UserID, p.SessionID)
	}
	httpx.ClearSessionCookies(w, r)
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if _, _, err := identity.ValidateEmail(body.Email); err != nil {
		writeErr(w, r, err)
		return
	}
	_ = a.Identity.RequestPasswordReset(r.Context(), body.Email)
	httpx.WriteJSON(w, http.StatusOK, map[string]string{
		"message": "If the email exists, a reset link will be sent.",
	})
}

func (a *ControlPlane) resetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Identity.ResetPassword(r.Context(), body.Token, body.NewPassword, identity.DefaultPasswordPolicy()); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) invitationPasswordPolicy(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeErr(w, r, domainerr.Validation("invitation_token_required", "token is required"))
		return
	}
	policy, err := a.Identity.PasswordPolicyForInvitationToken(r.Context(), token)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, policy)
}

func (a *ControlPlane) patchMe(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		DisplayName   *string         `json:"display_name"`
		Phone         *string         `json:"phone"`
		Bio           *string         `json:"bio"`
		Timezone      *string         `json:"timezone"`
		Locale        *string         `json:"locale"`
		Appearance    json.RawMessage `json:"appearance_json"`
		Notifications json.RawMessage `json:"notification_preferences_json"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	user, err := a.Identity.UpdateProfile(r.Context(), identity.UpdateProfileInput{
		UserID: p.UserID, DisplayName: body.DisplayName, Phone: body.Phone, Bio: body.Bio,
		Timezone: body.Timezone, Locale: body.Locale, Appearance: body.Appearance, Notifications: body.Notifications,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, user)
}

func (a *ControlPlane) changePassword(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		RevokeOthers    bool   `json:"revoke_other_sessions"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	var orgID *uuid.UUID
	if p.OrganizationID != uuid.Nil {
		orgID = &p.OrganizationID
	}
	policy, err := a.Identity.PasswordPolicyForOrganization(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := a.Identity.ChangePassword(r.Context(), identity.ChangePasswordInput{
		UserID: p.UserID, CurrentPassword: body.CurrentPassword, NewPassword: body.NewPassword,
		Policy: policy, RevokeOthers: body.RevokeOthers, CurrentSession: p.SessionID,
	}); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_multipart", "Invalid multipart body"))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, r, domainerr.Validation("file_required", "file is required"))
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 5<<20+1))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	ct := header.Header.Get("Content-Type")
	if ct == "" {
		ct = http.DetectContentType(data)
	}
	if err := a.Identity.SetAvatar(r.Context(), p.UserID, ct, data); err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Identity.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, user)
}

func (a *ControlPlane) deleteAvatar(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if err := a.Identity.DeleteAvatar(r.Context(), p.UserID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) getAvatar(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	data, ct, err := a.Identity.GetAvatar(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (a *ControlPlane) getMFA(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	status, err := a.Identity.GetMFAStatus(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, status)
}

func (a *ControlPlane) enrollMFA(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	user, err := a.Identity.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	result, err := a.Identity.BeginMFAEnroll(r.Context(), p.UserID, user.Email)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (a *ControlPlane) confirmMFA(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Code string `json:"code"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	codes, err := a.Identity.ConfirmMFAEnroll(r.Context(), p.UserID, body.Code)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	user, err := a.Identity.GetByID(r.Context(), p.UserID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	out := map[string]any{"recovery_codes": codes, "user": user}
	if p.Purpose == auth.PurposeMFASetup {
		var orgID *uuid.UUID
		if p.OrganizationID != uuid.Nil {
			orgID = &p.OrganizationID
		}
		absolute := 8 * time.Hour
		if orgID != nil {
			if settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), *orgID); err == nil {
				absolute = time.Duration(settings.SessionAbsoluteTimeoutMinutes) * time.Minute
			}
		}
		created, err := a.Identity.CreateSession(r.Context(), identity.CreateSessionInput{
			UserID: user.ID, UserAgent: r.UserAgent(), IPAddress: clientIP(r), AbsoluteTTL: absolute,
		})
		if err != nil {
			writeErr(w, r, err)
			return
		}
		token, exp, err := a.Tokens.IssueUserTokenEx(auth.IssueUserTokenInput{
			UserID: user.ID, PlatformRole: user.PlatformRole, OrganizationID: orgID,
			SessionID: &created.Session.ID, JTI: created.JTI,
		})
		if err != nil {
			writeErr(w, r, err)
			return
		}
		a.writeAuthCookies(w, r, token, created.RefreshToken, false, absolute)
		out["expires_at"] = exp
		out["organization_id"] = orgID
		out["mfa_setup_required"] = false
		out["token_type"] = "Bearer"
	}
	a.persistTrustedDevice(w, r, p.UserID)
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *ControlPlane) disableMFA(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	if err := a.Identity.DisableMFA(r.Context(), p.UserID, body.Password, body.Code); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) regenerateRecoveryCodes(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var body struct {
		Password string `json:"password"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	codes, err := a.Identity.RegenerateRecoveryCodes(r.Context(), p.UserID, body.Password)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"recovery_codes": codes})
}

func (a *ControlPlane) listSessions(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	items, err := a.Identity.ListSessions(r.Context(), p.UserID, p.SessionID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) revokeSession(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	sessionID, err := uuid.Parse(chi.URLParam(r, "session_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_session_id", "Invalid session_id"))
		return
	}
	if err := a.Identity.RevokeSession(r.Context(), p.UserID, sessionID); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *ControlPlane) revokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	if p.SessionID == uuid.Nil {
		writeErr(w, r, domainerr.Validation("session_required", "Current session is required"))
		return
	}
	n, err := a.Identity.RevokeOtherSessions(r.Context(), p.UserID, p.SessionID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"revoked": n})
}

func (a *ControlPlane) listSecurityEvents(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	items, err := a.Identity.ListSecurityEvents(r.Context(), p.UserID, 100)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (a *ControlPlane) getAuthSettings(w http.ResponseWriter, r *http.Request) {
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationAccess(r, orgID); err != nil {
		writeErr(w, r, err)
		return
	}
	settings, err := a.Orgs.GetAuthenticationSettings(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settings)
}

func (a *ControlPlane) patchAuthSettings(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	orgID, err := uuid.Parse(chi.URLParam(r, "organization_id"))
	if err != nil {
		writeErr(w, r, domainerr.Validation("invalid_organization_id", "Invalid organization_id"))
		return
	}
	if err := a.ensureOrganizationPermission(r, orgID, "organization:update"); err != nil {
		writeErr(w, r, err)
		return
	}
	var body struct {
		MinPasswordLength             *int    `json:"min_password_length"`
		MaxPasswordLength             *int    `json:"max_password_length"`
		RequireUppercase              *bool   `json:"require_uppercase"`
		RequireLowercase              *bool   `json:"require_lowercase"`
		RequireNumber                 *bool   `json:"require_number"`
		RequireSpecial                *bool   `json:"require_special"`
		MFARequired                   *bool   `json:"mfa_required"`
		AccessLocked                  *bool   `json:"access_locked"`
		AccessLockMessage             *string `json:"access_lock_message"`
		SessionIdleTimeoutMinutes     *int    `json:"session_idle_timeout_minutes"`
		SessionAbsoluteTimeoutMinutes *int    `json:"session_absolute_timeout_minutes"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, r, domainerr.Validation("invalid_json", "Invalid JSON body"))
		return
	}
	settings, err := a.Orgs.UpdateAuthenticationSettings(r.Context(), organization.UpdateAuthenticationSettingsInput{
		OrganizationID: orgID, ActorUserID: p.UserID,
		MinPasswordLength: body.MinPasswordLength, MaxPasswordLength: body.MaxPasswordLength,
		RequireUppercase: body.RequireUppercase, RequireLowercase: body.RequireLowercase,
		RequireNumber: body.RequireNumber, RequireSpecial: body.RequireSpecial,
		MFARequired: body.MFARequired, AccessLocked: body.AccessLocked, AccessLockMessage: body.AccessLockMessage,
		SessionIdleTimeoutMinutes: body.SessionIdleTimeoutMinutes, SessionAbsoluteTimeoutMinutes: body.SessionAbsoluteTimeoutMinutes,
	})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settings)
}

func (a *ControlPlane) myPasswordPolicy(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	var orgID *uuid.UUID
	if p.OrganizationID != uuid.Nil {
		orgID = &p.OrganizationID
	}
	policy, err := a.Identity.PasswordPolicyForOrganization(r.Context(), orgID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, policy)
}
