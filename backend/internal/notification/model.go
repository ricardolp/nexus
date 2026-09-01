package notification

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type Notification struct {
	ID             uuid.UUID       `json:"id"`
	UserID         uuid.UUID       `json:"user_id"`
	OrganizationID *uuid.UUID      `json:"organization_id,omitempty"`
	Type           string          `json:"type"`
	Title          string          `json:"title"`
	Body           string          `json:"body,omitempty"`
	Data           json.RawMessage `json:"data,omitempty"`
	ReadAt         *time.Time      `json:"read_at,omitempty"`
	CreatedAt      time.Time       `json:"created_at"`
}

type CreateInput struct {
	UserID         uuid.UUID
	OrganizationID *uuid.UUID
	Type           string
	Title          string
	Body           string
	Data           map[string]any
}

type ListInput struct {
	UserID     uuid.UUID
	UnreadOnly bool
	Limit      int
}

const (
	MaxTypeLength  = 100
	MaxTitleLength = 200
	MaxBodyLength  = 2000

	DefaultListLimit = 50
	MaxListLimit     = 200
)

func ValidateCreateInput(in CreateInput) (typ, title, body string, err error) {
	if in.UserID == uuid.Nil {
		return "", "", "", domainerr.Validation("user_id_required", "user_id is required")
	}
	typ = strings.TrimSpace(in.Type)
	if typ == "" {
		return "", "", "", domainerr.Validation("type_required", "type is required")
	}
	if len(typ) > MaxTypeLength {
		return "", "", "", domainerr.Validation("invalid_type", "type must contain at most 100 characters")
	}
	title = strings.TrimSpace(in.Title)
	if title == "" {
		return "", "", "", domainerr.Validation("title_required", "title is required")
	}
	if len(title) > MaxTitleLength {
		return "", "", "", domainerr.Validation("invalid_title", "title must contain at most 200 characters")
	}
	body = strings.TrimSpace(in.Body)
	if len(body) > MaxBodyLength {
		return "", "", "", domainerr.Validation("invalid_body", "body must contain at most 2000 characters")
	}
	return typ, title, body, nil
}

// NormalizeListLimit clamps a user-supplied page size to (0, MaxListLimit],
// falling back to DefaultListLimit when the caller did not specify one.
func NormalizeListLimit(limit int) int {
	if limit <= 0 {
		return DefaultListLimit
	}
	if limit > MaxListLimit {
		return MaxListLimit
	}
	return limit
}
