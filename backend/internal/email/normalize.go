package email

import (
	"net/mail"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const (
	maxAddressesPerField = 20
	maxEmailLength       = 320
)

func NormalizeAddresses(emails []string) ([]string, error) {
	out := make([]string, 0, len(emails))
	seen := make(map[string]struct{}, len(emails))
	for _, raw := range emails {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		normalized, err := normalizeAddress(trimmed)
		if err != nil {
			return nil, err
		}
		if _, dup := seen[normalized]; dup {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	if len(out) > maxAddressesPerField {
		return nil, domainerr.Validation("invalid_addresses", "at most 20 addresses per field")
	}
	return out, nil
}

func normalizeAddress(email string) (string, error) {
	if len(email) > maxEmailLength || strings.ContainsAny(email, "\r\n") {
		return "", domainerr.Validation("invalid_email", "invalid email: "+email)
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return "", domainerr.Validation("invalid_email", "invalid email: "+email)
	}
	return strings.ToLower(email), nil
}

func normalizeFromAddress(email string) (string, error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return "", domainerr.Validation("invalid_from_address", "from address is required")
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return "", domainerr.Validation("invalid_from_address", "invalid from address")
	}
	return strings.ToLower(addr.Address), nil
}
