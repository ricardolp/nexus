package support

import (
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

const (
	StatusOpen       = "open"
	StatusInProgress = "in_progress"
	StatusResolved   = "resolved"
	StatusClosed     = "closed"

	PriorityLow      = "low"
	PriorityMedium   = "medium"
	PriorityHigh     = "high"
	PriorityCritical = "critical"

	EnvironmentProduction   = "production"
	EnvironmentHomologation = "homologation"

	EventCreated  = "ticket.created"
	EventReplied  = "ticket.replied"
	EventAttached = "ticket.attached"

	MaxSubjectLength = 200
	MaxBodyLength    = 50000
	MaxFilenameLen   = 255
	MaxAttachments   = 10
	MaxAttachmentB   = 5 << 20

	DefaultListLimit = 20
	MaxListLimit     = 100

	ObjectPrefix = "support"
)

var slaHours = map[string]int{
	PriorityLow:      120,
	PriorityMedium:   48,
	PriorityHigh:     8,
	PriorityCritical: 1,
}

type Ticket struct {
	ID              uuid.UUID      `json:"id"`
	OrganizationID  uuid.UUID      `json:"organization_id"`
	OpenedByUserID  uuid.UUID      `json:"opened_by_user_id"`
	OpenedByEmail   string         `json:"opened_by_email,omitempty"`
	PublicNumber    int64          `json:"public_number"`
	PublicID        string         `json:"public_id"`
	Subject         string         `json:"subject"`
	Status          string         `json:"status"`
	Priority        string         `json:"priority"`
	SLAHours        int            `json:"sla_hours"`
	SLADueAt        time.Time      `json:"sla_due_at"`
	Environment     string         `json:"environment"`
	Preview         string         `json:"preview,omitempty"`
	AttachmentCount int            `json:"attachment_count,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
	Messages        []Message      `json:"messages,omitempty"`
	Attachments     []Attachment   `json:"attachments,omitempty"`
	DocumentLinks   []DocumentLink `json:"document_links,omitempty"`
	Events          []Event        `json:"events,omitempty"`
}

type Message struct {
	ID           uuid.UUID `json:"id"`
	TicketID     uuid.UUID `json:"ticket_id"`
	AuthorUserID uuid.UUID `json:"author_user_id"`
	AuthorEmail  string    `json:"author_email,omitempty"`
	BodyHTML     string    `json:"body_html"`
	BodyText     string    `json:"body_text"`
	CreatedAt    time.Time `json:"created_at"`
}

type Attachment struct {
	ID               uuid.UUID  `json:"id"`
	TicketID         uuid.UUID  `json:"ticket_id"`
	MessageID        *uuid.UUID `json:"message_id,omitempty"`
	OriginalFilename string     `json:"original_filename"`
	ContentType      string     `json:"content_type"`
	SHA256           string     `json:"sha256"`
	SizeBytes        int64      `json:"size_bytes"`
	CreatedByUserID  uuid.UUID  `json:"created_by_user_id"`
	CreatedAt        time.Time  `json:"created_at"`
}

type DocumentLink struct {
	ID               uuid.UUID  `json:"id"`
	TicketID         uuid.UUID  `json:"ticket_id"`
	DocumentNumber   string     `json:"document_number"`
	DocumentType     string     `json:"document_type"`
	FiscalDocumentID *uuid.UUID `json:"fiscal_document_id,omitempty"`
}

type Event struct {
	ID          uuid.UUID  `json:"id"`
	TicketID    uuid.UUID  `json:"ticket_id"`
	EventType   string     `json:"event_type"`
	FromStatus  *string    `json:"from_status,omitempty"`
	ToStatus    *string    `json:"to_status,omitempty"`
	ActorUserID *uuid.UUID `json:"actor_user_id,omitempty"`
	OccurredAt  time.Time  `json:"occurred_at"`
}

type CreateInput struct {
	OrganizationID uuid.UUID
	OpenedByUserID uuid.UUID
	Subject        string
	BodyHTML       string
	Priority       string
	DocumentLinks  []DocumentLinkInput
}

type DocumentLinkInput struct {
	DocumentNumber   string     `json:"document_number"`
	DocumentType     string     `json:"document_type"`
	FiscalDocumentID *uuid.UUID `json:"fiscal_document_id"`
}

type AddMessageInput struct {
	OrganizationID uuid.UUID
	TicketID       uuid.UUID
	AuthorUserID   uuid.UUID
	BodyHTML       string
}

type AddAttachmentInput struct {
	OrganizationID uuid.UUID
	TicketID       uuid.UUID
	MessageID      *uuid.UUID
	CreatedBy      uuid.UUID
	Filename       string
	ContentType    string
	Data           []byte
}

type ListInput struct {
	OrganizationID uuid.UUID
	OpenedByUserID *uuid.UUID
	Status         string
	Page           int
	Limit          int
}

type ListResult struct {
	Items  []Ticket       `json:"items"`
	Total  int            `json:"total"`
	Page   int            `json:"page"`
	Limit  int            `json:"limit"`
	Counts map[string]int `json:"counts"`
}

type Config struct {
	Environment       string   `json:"environment"`
	AllowedPriorities []string `json:"allowed_priorities"`
}

func ResolveEnvironment(appEnv string) string {
	switch strings.ToLower(strings.TrimSpace(appEnv)) {
	case "production", "prd", "prod", "producao", "produção":
		return EnvironmentProduction
	default:
		return EnvironmentHomologation
	}
}

func AllowedPriorities(environment string) []string {
	if environment == EnvironmentProduction {
		return []string{PriorityLow, PriorityMedium, PriorityHigh, PriorityCritical}
	}
	return []string{PriorityMedium}
}

func SLAHours(priority string) int {
	return slaHours[priority]
}

func NormalizePriority(priority, environment string) (string, error) {
	p := strings.ToLower(strings.TrimSpace(priority))
	if p == "" {
		p = PriorityMedium
	}
	allowed := AllowedPriorities(environment)
	for _, a := range allowed {
		if p == a {
			return p, nil
		}
	}
	if environment != EnvironmentProduction {
		return "", domainerr.Validation("priority_not_allowed", "only medium priority is allowed in homologation")
	}
	return "", domainerr.Validation("invalid_priority", "priority must be low, medium, high or critical")
}

func NormalizePage(page, limit int) (int, int) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}
	return page, limit
}

func NormalizeStatusFilter(status string) (string, error) {
	s := strings.TrimSpace(status)
	if s == "" {
		return "", nil
	}
	switch s {
	case StatusOpen, StatusInProgress, StatusResolved, StatusClosed:
		return s, nil
	default:
		return "", domainerr.Validation("invalid_status", "status must be open, in_progress, resolved or closed")
	}
}

func ValidateCreateInput(in CreateInput) (subject, html, text, priority string, links []DocumentLinkInput, err error) {
	if in.OrganizationID == uuid.Nil {
		return "", "", "", "", nil, domainerr.Validation("organization_id_required", "organization_id is required")
	}
	if in.OpenedByUserID == uuid.Nil {
		return "", "", "", "", nil, domainerr.Validation("user_id_required", "opened_by_user_id is required")
	}
	subject = strings.TrimSpace(in.Subject)
	if subject == "" {
		return "", "", "", "", nil, domainerr.Validation("subject_required", "subject is required")
	}
	if utf8.RuneCountInString(subject) > MaxSubjectLength {
		return "", "", "", "", nil, domainerr.Validation("invalid_subject", "subject must contain at most 200 characters")
	}
	html, text, err = NormalizeBody(in.BodyHTML)
	if err != nil {
		return "", "", "", "", nil, err
	}
	priority = strings.ToLower(strings.TrimSpace(in.Priority))
	links, err = NormalizeDocumentLinks(in.DocumentLinks)
	if err != nil {
		return "", "", "", "", nil, err
	}
	return subject, html, text, priority, links, nil
}

func NormalizeBody(html string) (cleanHTML, text string, err error) {
	cleanHTML = strings.TrimSpace(html)
	if cleanHTML == "" {
		return "", "", domainerr.Validation("body_required", "message body is required")
	}
	if utf8.RuneCountInString(cleanHTML) > MaxBodyLength {
		return "", "", domainerr.Validation("invalid_body", "message body must contain at most 50000 characters")
	}
	if strings.ContainsRune(cleanHTML, 0) {
		return "", "", domainerr.Validation("invalid_body", "message body contains invalid characters")
	}
	text = StripHTML(cleanHTML)
	if strings.TrimSpace(text) == "" {
		return "", "", domainerr.Validation("body_required", "message body is required")
	}
	return cleanHTML, text, nil
}

func NormalizeDocumentLinks(in []DocumentLinkInput) ([]DocumentLinkInput, error) {
	if len(in) == 0 {
		return nil, nil
	}
	seen := map[string]struct{}{}
	out := make([]DocumentLinkInput, 0, len(in))
	for _, raw := range in {
		number := strings.TrimSpace(raw.DocumentNumber)
		if number == "" {
			continue
		}
		if utf8.RuneCountInString(number) > 44 {
			return nil, domainerr.Validation("invalid_document_number", "document_number is too long")
		}
		typ := strings.ToLower(strings.TrimSpace(raw.DocumentType))
		if typ == "" {
			typ = "nfe"
		}
		if typ != "nfe" && typ != "nfse" {
			return nil, domainerr.Validation("invalid_document_type", "document_type must be nfe or nfse")
		}
		key := typ + ":" + number
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		link := DocumentLinkInput{DocumentNumber: number, DocumentType: typ}
		if raw.FiscalDocumentID != nil && *raw.FiscalDocumentID != uuid.Nil {
			link.FiscalDocumentID = raw.FiscalDocumentID
		}
		out = append(out, link)
	}
	return out, nil
}

func FormatPublicID(n int64) string {
	return "NX-" + itoa(n)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
