package inbound

import (
	"net/mail"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const (
	maxResponsibleEmails = 20
	maxEmailLength       = 320
)

// NormalizeResponsibleEmails trims, lowercases and de-duplicates addresses,
// skipping blanks. Invalid values are rejected so a bad chip never reaches
// the database.
func NormalizeResponsibleEmails(emails []string) ([]string, error) {
	out := make([]string, 0, len(emails))
	seen := make(map[string]struct{}, len(emails))
	for _, raw := range emails {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" {
			continue
		}
		normalized, err := normalizeResponsibleEmail(trimmed)
		if err != nil {
			return nil, err
		}
		if _, dup := seen[normalized]; dup {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}
	if len(out) > maxResponsibleEmails {
		return nil, domainerr.Validation("invalid_scenario_rule", "responsible_emails accepts at most 20 addresses")
	}
	return out, nil
}

func normalizeResponsibleEmail(email string) (string, error) {
	if len(email) > maxEmailLength || strings.ContainsAny(email, "\r\n") {
		return "", domainerr.Validation("invalid_responsible_email", "invalid email: "+email)
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || !strings.Contains(email, "@") {
		return "", domainerr.Validation("invalid_responsible_email", "invalid email: "+email)
	}
	return strings.ToLower(email), nil
}
