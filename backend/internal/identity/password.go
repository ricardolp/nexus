package identity

import (
	"fmt"
	"strings"
	"unicode"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// PasswordPolicy is the tenant (or platform-default) password rule set.
type PasswordPolicy struct {
	MinLength        int  `json:"min_length"`
	MaxLength        int  `json:"max_length"`
	RequireUppercase bool `json:"require_uppercase"`
	RequireLowercase bool `json:"require_lowercase"`
	RequireNumber    bool `json:"require_number"`
	RequireSpecial   bool `json:"require_special"`
}

func DefaultPasswordPolicy() PasswordPolicy {
	return PasswordPolicy{
		MinLength: MinPasswordLength,
		MaxLength: MaxPasswordLength,
	}
}

func ClampPasswordPolicy(p PasswordPolicy) PasswordPolicy {
	if p.MinLength < 8 {
		p.MinLength = 8
	}
	if p.MinLength > 128 {
		p.MinLength = 128
	}
	if p.MaxLength < p.MinLength {
		p.MaxLength = p.MinLength
	}
	if p.MaxLength > 128 {
		p.MaxLength = 128
	}
	return p
}

func ValidatePasswordAgainst(password string, policy PasswordPolicy) error {
	policy = ClampPasswordPolicy(policy)
	if len(password) < policy.MinLength {
		return domainerr.Validation("invalid_password", fmt.Sprintf("password must contain at least %d characters", policy.MinLength))
	}
	if len(password) > policy.MaxLength {
		return domainerr.Validation("invalid_password", fmt.Sprintf("password must contain at most %d characters", policy.MaxLength))
	}
	var hasUpper, hasLower, hasNumber, hasSpecial bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasNumber = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			hasSpecial = true
		}
	}
	if policy.RequireUppercase && !hasUpper {
		return domainerr.Validation("invalid_password", "password must contain an uppercase letter")
	}
	if policy.RequireLowercase && !hasLower {
		return domainerr.Validation("invalid_password", "password must contain a lowercase letter")
	}
	if policy.RequireNumber && !hasNumber {
		return domainerr.Validation("invalid_password", "password must contain a number")
	}
	if policy.RequireSpecial && !hasSpecial {
		return domainerr.Validation("invalid_password", "password must contain a special character")
	}
	lower := strings.ToLower(password)
	for _, blocked := range []string{"password", "senha123", "123456789012", "qwertyuiopas"} {
		if strings.Contains(lower, blocked) {
			return domainerr.Validation("invalid_password", "password is too common")
		}
	}
	return nil
}
