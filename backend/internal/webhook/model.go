package webhook

import (
	"time"

	"github.com/google/uuid"
)

type Endpoint struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID *uuid.UUID `json:"organization_company_id,omitempty"`
	Name                  string     `json:"name"`
	URL                   string     `json:"url"`
	Status                string     `json:"status"`
	APIVersion            string     `json:"api_version"`
	TimeoutMS             int        `json:"timeout_ms"`
	MaxAttempts           int        `json:"max_attempts"`
	CreatedAt             time.Time  `json:"created_at"`
}

type CreatedEndpoint struct {
	Endpoint Endpoint `json:"endpoint"`
	Secret   string   `json:"secret"`
}

type CreateEndpointInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID *uuid.UUID
	Name                  string
	URL                   string
	EventTypes            []string
}
