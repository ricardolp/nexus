package email

import (
	"time"

	"github.com/google/uuid"
)

const (
	StatusActive   = "active"
	StatusDisabled = "disabled"

	MessageRendered = "rendered"
	MessageSent     = "sent"
	MessageFailed   = "failed"
	MessageNotSent  = "not_sent"

	AttachmentXML         = "xml"
	AttachmentDanfeSEFAZ  = "danfe_sefaz"
	AttachmentDanfeCustom = "danfe_custom"
)

type Credentials struct {
	OrganizationID   uuid.UUID  `json:"organization_id"`
	Host             string     `json:"host"`
	Port             int        `json:"port"`
	Username         string     `json:"username"`
	HasPassword      bool       `json:"has_password"`
	FromName         string     `json:"from_name"`
	FromAddress      string     `json:"from_address"`
	Status           string     `json:"status"`
	LastTestedAt     *time.Time `json:"last_tested_at,omitempty"`
	LastTestError    *string    `json:"last_test_error,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type UpdateCredentialsInput struct {
	OrganizationID uuid.UUID
	Host           string
	Port           int
	Username       string
	Password       *string // nil = keep, "" = clear
	FromName       string
	FromAddress    string
	Status         string
}

type Template struct {
	ID                    uuid.UUID `json:"id"`
	OrganizationID        uuid.UUID `json:"organization_id"`
	OrganizationCompanyID uuid.UUID `json:"organization_company_id"`
	ProcessCode           string    `json:"process_code"`
	ProcessLabel          string    `json:"process_label"`
	Enabled               bool      `json:"enabled"`
	Subject               string    `json:"subject"`
	ToAddresses           []string  `json:"to_addresses"`
	CcAddresses           []string  `json:"cc_addresses"`
	BodyHTML              string    `json:"body_html"`
	FromName              *string   `json:"from_name,omitempty"`
	FromAddress           *string   `json:"from_address,omitempty"`
	AttachXML             bool      `json:"attach_xml"`
	AttachDanfeSEFAZ      bool      `json:"attach_danfe_sefaz"`
	AttachDanfeCustom     bool      `json:"attach_danfe_custom"`
	UsePartnerEmail       bool      `json:"use_partner_email"`
	UseRecipientEmail     bool      `json:"use_recipient_email"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type UpdateTemplateInput struct {
	OrganizationID        uuid.UUID
	CompanyID             uuid.UUID
	ProcessCode           string
	Enabled               *bool
	Subject               *string
	ToAddresses           []string
	CcAddresses           []string
	BodyHTML              *string
	FromName              *string
	FromAddress           *string
	AttachXML             *bool
	AttachDanfeSEFAZ      *bool
	AttachDanfeCustom     *bool
	UsePartnerEmail       *bool
	UseRecipientEmail     *bool
	ClearFromOverride     bool
}

type Message struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID uuid.UUID  `json:"organization_company_id"`
	OrganizationDocumentID *uuid.UUID `json:"organization_document_id,omitempty"`
	TemplateID            *uuid.UUID `json:"template_id,omitempty"`
	ProcessCode           string     `json:"process_code"`
	ProcessLabel          string     `json:"process_label"`
	Status                string     `json:"status"`
	FromName              string     `json:"from_name"`
	FromAddress           string     `json:"from_address"`
	ToAddresses           []string   `json:"to_addresses"`
	CcAddresses           []string   `json:"cc_addresses"`
	Subject               string     `json:"subject"`
	BodyHTML              string     `json:"body_html"`
	BodyPlain             string     `json:"body_plain"`
	SentAt                *time.Time `json:"sent_at,omitempty"`
	AttemptCount          int        `json:"attempt_count"`
	LastError             *string    `json:"last_error,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
	CompanyLegalName      string     `json:"company_legal_name,omitempty"`
	CompanyTradeName      *string    `json:"company_trade_name,omitempty"`
	Attachments           []Attachment `json:"attachments,omitempty"`
}

type Attachment struct {
	ID          uuid.UUID `json:"id"`
	MessageID   uuid.UUID `json:"message_id"`
	Kind        string    `json:"kind"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	Available   bool      `json:"available"`
	CreatedAt   time.Time `json:"created_at"`
}

type ListMessagesInput struct {
	OrganizationID        uuid.UUID
	CompanyID             *uuid.UUID
	ProcessCode           string
	Status                string
	Query                 string
	Limit                 int
}
