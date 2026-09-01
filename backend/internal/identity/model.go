package identity

import (
	"encoding/json"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type User struct {
	ID                    uuid.UUID       `json:"id"`
	PlatformRole          string          `json:"platform_role"`
	Email                 string          `json:"email"`
	EmailNormalized       string          `json:"email_normalized"`
	EmailVerifiedAt       *time.Time      `json:"email_verified_at,omitempty"`
	Status                string          `json:"status"`
	DisplayName           *string         `json:"display_name,omitempty"`
	Phone                 *string         `json:"phone,omitempty"`
	Bio                   *string         `json:"bio,omitempty"`
	Timezone              *string         `json:"timezone,omitempty"`
	Locale                *string         `json:"locale,omitempty"`
	HasAvatar             bool            `json:"has_avatar"`
	AppearanceJSON        json.RawMessage `json:"appearance_json,omitempty"`
	NotificationPrefsJSON json.RawMessage `json:"notification_preferences_json,omitempty"`
	MFAEnabled            bool            `json:"mfa_enabled"`
	PasswordChangedAt     *time.Time      `json:"password_changed_at,omitempty"`
	LastLoginAt           *time.Time      `json:"last_login_at,omitempty"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
	AvatarObjectKey       *string         `json:"-"`
}

type RegisterInput struct {
	Email        string
	Password     string
	PlatformRole string
}

type InviteUserInput struct {
	Email          string
	PlatformRole   string
	OrganizationID *uuid.UUID
	InvitedBy      uuid.UUID
}

type ResendInvitationInput struct {
	OrganizationID uuid.UUID
	MemberID       uuid.UUID
	InvitedBy      uuid.UUID
}

type Invitation struct {
	ID             uuid.UUID  `json:"id"`
	UserID         uuid.UUID  `json:"user_id"`
	OrganizationID *uuid.UUID `json:"organization_id,omitempty"`
	Email          string     `json:"email"`
	ExpiresAt      time.Time  `json:"expires_at"`
	CreatedAt      time.Time  `json:"created_at"`
}

type AcceptInvitationInput struct {
	Token    string
	Password string
}

const (
	InvitationTTL = 48 * time.Hour

	MinPasswordLength = 12
	MaxPasswordLength = 128
	MaxEmailLength    = 320

	PlatformRoleAdmin   = "admin"
	PlatformRoleSystem  = "system"
	PlatformRoleSupport = "support"
	PlatformRoleMember  = "member"
)

func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func ValidateEmail(value string) (email, normalized string, err error) {
	email = strings.TrimSpace(value)
	if email == "" {
		return "", "", domainerr.Validation("email_required", "email is required")
	}
	if len(email) > MaxEmailLength || strings.ContainsAny(email, "\r\n") {
		return "", "", domainerr.Validation("invalid_email", "email must be a valid address")
	}
	address, parseErr := mail.ParseAddress(email)
	if parseErr != nil || address.Address != email || !strings.Contains(email, "@") {
		return "", "", domainerr.Validation("invalid_email", "email must be a valid address")
	}
	return email, NormalizeEmail(email), nil
}

func ValidatePassword(password string) error {
	return ValidatePasswordAgainst(password, DefaultPasswordPolicy())
}

func ValidatePlatformRole(value string) (string, error) {
	role := strings.ToLower(strings.TrimSpace(value))
	if role == "" {
		role = PlatformRoleMember
	}
	switch role {
	case PlatformRoleAdmin, PlatformRoleSystem, PlatformRoleSupport, PlatformRoleMember:
		return role, nil
	default:
		return "", domainerr.Validation("invalid_platform_role", "platform_role must be admin, system, support or member")
	}
}

func CanCreateUser(actorRole, targetRole string) bool {
	switch actorRole {
	case PlatformRoleAdmin:
		return true
	case PlatformRoleSystem, PlatformRoleSupport:
		return targetRole == PlatformRoleMember ||
			targetRole == PlatformRoleSupport ||
			targetRole == PlatformRoleSystem
	case PlatformRoleMember:
		// Tenant members may invite other members into their organization.
		// The HTTP handler still requires organization_id and member:invite.
		return targetRole == PlatformRoleMember
	default:
		return false
	}
}

// CanDeleteUser mirrors CanCreateUser for soft-delete: admin may remove any
// platform identity; system/support may not elevate by deleting an admin.
func CanDeleteUser(actorRole, targetRole string) bool {
	return CanCreateUser(actorRole, targetRole)
}

func ValidateLoginInput(email, password string) error {
	if _, _, err := ValidateEmail(email); err != nil {
		return err
	}
	if password == "" {
		return domainerr.Validation("password_required", "password is required")
	}
	if len(password) > MaxPasswordLength {
		return domainerr.Validation("invalid_password", "password must contain at most 128 characters")
	}
	return nil
}

func ValidateInviteUserInput(in InviteUserInput) (email, normalized, role string, err error) {
	email, normalized, err = ValidateEmail(in.Email)
	if err != nil {
		return "", "", "", err
	}
	role, err = ValidatePlatformRole(in.PlatformRole)
	if err != nil {
		return "", "", "", err
	}
	if role == PlatformRoleMember && (in.OrganizationID == nil || *in.OrganizationID == uuid.Nil) {
		return "", "", "", domainerr.Validation("organization_required", "organization_id is required for member users")
	}
	if in.InvitedBy == uuid.Nil {
		return "", "", "", domainerr.Validation("inviter_required", "invited_by is required")
	}
	return email, normalized, role, nil
}

func ValidateResendInvitationInput(in ResendInvitationInput) error {
	if in.OrganizationID == uuid.Nil {
		return domainerr.Validation("invalid_organization_id", "organization_id is required")
	}
	if in.MemberID == uuid.Nil {
		return domainerr.Validation("invalid_member_id", "member_id is required")
	}
	if in.InvitedBy == uuid.Nil {
		return domainerr.Validation("inviter_required", "invited_by is required")
	}
	return nil
}

func ValidateAcceptInvitationInput(in AcceptInvitationInput) error {
	if strings.TrimSpace(in.Token) == "" {
		return domainerr.Validation("invitation_token_required", "token is required")
	}
	return ValidatePassword(in.Password)
}

func ValidateRegisterInput(in RegisterInput) (email, normalized, role string, err error) {
	email, normalized, err = ValidateEmail(in.Email)
	if err != nil {
		return "", "", "", err
	}
	if err = ValidatePassword(in.Password); err != nil {
		return "", "", "", err
	}
	role, err = ValidatePlatformRole(in.PlatformRole)
	if err != nil {
		return "", "", "", err
	}
	return email, normalized, role, nil
}
