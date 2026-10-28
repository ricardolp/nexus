package faq

import (
	"time"

	"github.com/google/uuid"
)

const (
	SourceSEFAZ = "SEFAZ"
	SourceSAP   = "SAP"
	SourceAPI   = "API"
	SourceNEXUS = "NEXUS"

	SeverityDenied    = "DENIED"
	SeverityRejected  = "REJECTED"
	SeverityTechnical = "TECHNICAL"
	SeverityUnknown   = "UNKNOWN"

	ActionReverseSource  = "REVERSE_SOURCE"
	ActionResetAndResend = "RESET_AND_RESEND"
	ActionWaitRetry      = "WAIT_RETRY"
	ActionContactSupport = "CONTACT_SUPPORT"
	ActionNone           = "NONE"

	GenericCode = "*"
	DefaultLang = "PT"
)

type Message struct {
	ID                 uuid.UUID `json:"id"`
	Source             string    `json:"source"`
	Code               string    `json:"code"`
	Docsta             string    `json:"docsta"`
	Lang               string    `json:"lang"`
	Severity           string    `json:"severity"`
	Title              string    `json:"title"`
	Summary            string    `json:"summary"`
	Steps              []string  `json:"steps"`
	ForbiddenActions   []string  `json:"forbidden_actions"`
	RecommendedAction  string    `json:"recommended_action"`
	FAQSlug            *string   `json:"faq_slug,omitempty"`
	Active             bool      `json:"active"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type LookupResult struct {
	Found             bool       `json:"found"`
	Source            string     `json:"source"`
	Code              string     `json:"code"`
	Docsta            *string    `json:"docsta,omitempty"`
	Severity          string     `json:"severity"`
	Title             *string    `json:"title"`
	Summary           *string    `json:"summary"`
	SefazText         *string    `json:"sefaz_text,omitempty"`
	Steps             []string   `json:"steps"`
	ForbiddenActions  []string   `json:"forbidden_actions"`
	RecommendedAction string     `json:"recommended_action"`
	FAQURL            *string    `json:"faq_url"`
	UpdatedAt         *time.Time `json:"updated_at"`
}

type LookupInput struct {
	OrganizationID uuid.UUID
	Source         string
	Code           string
	Docsta         string
	Message        string
	Docnum         string
	Model          string
	Lang           string
}

type CreateMessageInput struct {
	Source            string
	Code              string
	Docsta            string
	Lang              string
	Severity          string
	Title             string
	Summary           string
	Steps             []string
	ForbiddenActions  []string
	RecommendedAction string
	FAQSlug           *string
	Active            *bool
}

type UpdateMessageInput struct {
	Source            string
	Code              string
	Docsta            string
	Lang              string
	Severity          string
	Title             string
	Summary           string
	Steps             []string
	ForbiddenActions  []string
	RecommendedAction string
	FAQSlug           *string
	Active            *bool
}

type ListMessagesInput struct {
	Source string
	Code   string
	Q      string
	Active *bool
	Limit  int
}

type ListHitsInput struct {
	OrganizationID *uuid.UUID
	Limit          int
}

type MissingHit struct {
	Source   string    `json:"source"`
	Code     string    `json:"code"`
	Docsta   string    `json:"docsta"`
	Count    int64     `json:"count"`
	LastSeen time.Time `json:"last_seen"`
}

type TopHit struct {
	Source         string    `json:"source"`
	Code           string    `json:"code"`
	Docsta         string    `json:"docsta"`
	Count          int64     `json:"count"`
	FoundCount     int64     `json:"found_count"`
	MissingCount   int64     `json:"missing_count"`
	LastSeen       time.Time `json:"last_seen"`
	OrganizationID *uuid.UUID `json:"organization_id,omitempty"`
}
