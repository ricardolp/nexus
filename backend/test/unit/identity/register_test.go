package identity_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestNormalizeEmail(t *testing.T) {
	t.Parallel()
	if got := identity.NormalizeEmail("  Admin@Example.COM "); got != "admin@example.com" {
		t.Fatalf("got %q", got)
	}
}

func TestValidateRegisterInput(t *testing.T) {
	t.Parallel()

	t.Run("ok_defaults_member", func(t *testing.T) {
		t.Parallel()
		email, normalized, role, err := identity.ValidateRegisterInput(identity.RegisterInput{
			Email: "User@Example.com", Password: "senha-super-segura",
		})
		if err != nil {
			t.Fatal(err)
		}
		if email != "User@Example.com" || normalized != "user@example.com" || role != "member" {
			t.Fatalf("%s %s %s", email, normalized, role)
		}
	})

	t.Run("short_password", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := identity.ValidateRegisterInput(identity.RegisterInput{
			Email: "a@b.com", Password: "short",
		})
		helpers.AssertDomainCode(t, err, "invalid_password")
	})

	t.Run("long_password", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := identity.ValidateRegisterInput(identity.RegisterInput{
			Email: "a@b.com", Password: string(make([]byte, identity.MaxPasswordLength+1)),
		})
		helpers.AssertDomainCode(t, err, "invalid_password")
	})

	t.Run("invalid_role", func(t *testing.T) {
		t.Parallel()
		_, _, _, err := identity.ValidateRegisterInput(identity.RegisterInput{
			Email: "a@b.com", Password: "senha-super-segura", PlatformRole: "root",
		})
		helpers.AssertDomainCode(t, err, "invalid_platform_role")
	})

	t.Run("admin_role", func(t *testing.T) {
		t.Parallel()
		_, _, role, err := identity.ValidateRegisterInput(identity.RegisterInput{
			Email: "a@b.com", Password: "senha-super-segura", PlatformRole: "admin",
		})
		if err != nil {
			t.Fatal(err)
		}
		if role != "admin" {
			t.Fatalf("role=%s", role)
		}
	})
}

func TestValidateEmail(t *testing.T) {
	t.Parallel()

	for name, value := range map[string]string{
		"empty":        "",
		"missing_at":   "not-an-email",
		"display_name": "User <user@example.com>",
		"line_break":   "user@example.com\nBcc: attacker@example.com",
	} {
		name, value := name, value
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, _, err := identity.ValidateEmail(value)
			if err == nil {
				t.Fatalf("expected validation error for %q", value)
			}
		})
	}

	email, normalized, err := identity.ValidateEmail(" User@Example.com ")
	if err != nil {
		t.Fatal(err)
	}
	if email != "User@Example.com" || normalized != "user@example.com" {
		t.Fatalf("email=%q normalized=%q", email, normalized)
	}
}

func TestValidateInviteUserInput(t *testing.T) {
	t.Parallel()

	inviter := uuid.New()
	organizationID := uuid.New()
	_, _, role, err := identity.ValidateInviteUserInput(identity.InviteUserInput{
		Email: "member@example.com", OrganizationID: &organizationID, InvitedBy: inviter,
	})
	if err != nil {
		t.Fatal(err)
	}
	if role != identity.PlatformRoleMember {
		t.Fatalf("role=%s", role)
	}

	_, _, _, err = identity.ValidateInviteUserInput(identity.InviteUserInput{
		Email: "member@example.com", InvitedBy: inviter,
	})
	helpers.AssertDomainCode(t, err, "organization_required")
}

func TestValidateResendInvitationInput(t *testing.T) {
	t.Parallel()

	orgID := uuid.New()
	memberID := uuid.New()
	inviter := uuid.New()
	if err := identity.ValidateResendInvitationInput(identity.ResendInvitationInput{
		OrganizationID: orgID, MemberID: memberID, InvitedBy: inviter,
	}); err != nil {
		t.Fatal(err)
	}

	helpers.AssertDomainCode(t, identity.ValidateResendInvitationInput(identity.ResendInvitationInput{
		MemberID: memberID, InvitedBy: inviter,
	}), "invalid_organization_id")
	helpers.AssertDomainCode(t, identity.ValidateResendInvitationInput(identity.ResendInvitationInput{
		OrganizationID: orgID, InvitedBy: inviter,
	}), "invalid_member_id")
	helpers.AssertDomainCode(t, identity.ValidateResendInvitationInput(identity.ResendInvitationInput{
		OrganizationID: orgID, MemberID: memberID,
	}), "inviter_required")
}

func TestCanCreateUser(t *testing.T) {
	t.Parallel()

	if !identity.CanCreateUser(identity.PlatformRoleAdmin, identity.PlatformRoleSystem) {
		t.Fatal("admin must be able to create system users")
	}
	if !identity.CanCreateUser(identity.PlatformRoleSupport, identity.PlatformRoleMember) {
		t.Fatal("support must be able to create member users")
	}
	if identity.CanCreateUser(identity.PlatformRoleSupport, identity.PlatformRoleAdmin) {
		t.Fatal("support must not be able to create admin users")
	}
	if !identity.CanCreateUser(identity.PlatformRoleMember, identity.PlatformRoleMember) {
		t.Fatal("member must be able to invite member users")
	}
	if identity.CanCreateUser(identity.PlatformRoleMember, identity.PlatformRoleSupport) {
		t.Fatal("member must not be able to create support users")
	}
}

func TestCanDeleteUser(t *testing.T) {
	t.Parallel()

	if !identity.CanDeleteUser(identity.PlatformRoleAdmin, identity.PlatformRoleSystem) {
		t.Fatal("admin must be able to delete system users")
	}
	if !identity.CanDeleteUser(identity.PlatformRoleSupport, identity.PlatformRoleMember) {
		t.Fatal("support must be able to delete member users")
	}
	if identity.CanDeleteUser(identity.PlatformRoleSupport, identity.PlatformRoleAdmin) {
		t.Fatal("support must not be able to delete admin users")
	}
	if identity.CanDeleteUser(identity.PlatformRoleMember, identity.PlatformRoleSupport) {
		t.Fatal("member must not be able to delete support users")
	}
}
