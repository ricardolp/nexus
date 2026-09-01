package identity_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/identity"
	"github.com/nexus/fiscal-messaging/test/helpers"
)

func TestValidatePasswordAgainstPolicy(t *testing.T) {
	t.Parallel()

	policy := identity.PasswordPolicy{
		MinLength: 12, MaxLength: 128,
		RequireUppercase: true, RequireNumber: true, RequireSpecial: true,
	}
	if err := identity.ValidatePasswordAgainst("senha-super-segura", policy); err == nil {
		t.Fatal("expected failure without uppercase/number/special")
	}
	if err := identity.ValidatePasswordAgainst("Senha-Super-1!", policy); err != nil {
		t.Fatal(err)
	}
	helpers.AssertDomainCode(t, identity.ValidatePasswordAgainst("short", identity.DefaultPasswordPolicy()), "invalid_password")
}
