package integration

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

const (
	TypeSAPCPI     = "sap_cpi"
	TypeSAPS4      = "sap_s4"
	TypeSAPECC     = "sap_ecc"
	TypeFiscalProv = "fiscal_provider"
	TypeCustomHTTP = "custom_http"

	StatusActive   = "active"
	StatusDisabled = "disabled"
	StatusError    = "error"
)

// Integration is an organization_integrations row — configuration for an
// outbound connection to SAP CPI/S4/ECC or another HTTP integration.
// organization_company_id is nullable: a null row is the organization-wide
// default, used when no company-specific row is active (see ResolveActive).
type Integration struct {
	ID                    uuid.UUID       `json:"id"`
	OrganizationID        uuid.UUID       `json:"organization_id"`
	OrganizationCompanyID *uuid.UUID      `json:"organization_company_id,omitempty"`
	Name                  string          `json:"name"`
	IntegrationType       string          `json:"integration_type"`
	Environment           string          `json:"environment"`
	BaseURL               *string         `json:"base_url,omitempty"`
	Status                string          `json:"status"`
	HasSecret             bool            `json:"has_secret"`
	ConfigurationJSON     json.RawMessage `json:"configuration_json"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

// Configuration is the shape used for integration_type=sap_cpi, decoded from
// ConfigurationJSON. Extra fields for other integration types can be added
// to configuration_json without a schema change.
type Configuration struct {
	ClientID     string            `json:"client_id,omitempty"`
	TokenURL     string            `json:"token_url,omitempty"`
	SAPClient    string            `json:"sap_client,omitempty"`
	SAPLanguage  string            `json:"sap_language,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
	QueryParams  map[string]string `json:"query_params,omitempty"`
	Capabilities Capabilities      `json:"capabilities,omitempty"`
}

// Capabilities gates which SAP operations an organization/company is allowed
// to configure a scenario step for (spec §36) — the engine must refuse to
// resolve a step whose required capability is false rather than fail at
// call time against SAP.
type Capabilities struct {
	PurchaseOrder          bool `json:"purchaseOrder"`
	InboundDelivery        bool `json:"inboundDelivery"`
	GoodsReceipt           bool `json:"goodsReceipt"`
	SupplierInvoice        bool `json:"supplierInvoice"`
	EWM                    bool `json:"ewm"`
	ServiceEntry           bool `json:"serviceEntry"`
	DirectGoodsReceipt     bool `json:"directGoodsReceipt"`
	AutomaticPurchaseOrder bool `json:"automaticPurchaseOrder"`
}

type CreateInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID *uuid.UUID
	Name                  string
	IntegrationType       string
	Environment           string
	BaseURL               string
	ClientSecret          string
	Configuration         Configuration
	ActorUserID           uuid.UUID
}

type UpdateInput struct {
	OrganizationID uuid.UUID
	ID             uuid.UUID
	Name           string
	BaseURL        string
	Status         string
	ClientSecret   *string // nil = keep current secret, "" = clear it
	Configuration  Configuration
	ActorUserID    uuid.UUID
}
