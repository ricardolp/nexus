package billing

import (
	"time"

	"github.com/google/uuid"
)

type Statement struct {
	OrganizationID uuid.UUID          `json:"organization_id"`
	LegalName      string             `json:"legal_name"`
	TradeName      *string            `json:"trade_name,omitempty"`
	Slug           string             `json:"slug"`
	TaxIdentifier  *string            `json:"tax_identifier,omitempty"`
	Timezone       string             `json:"timezone"`
	PeriodFrom     time.Time          `json:"period_from"`
	PeriodTo       time.Time          `json:"period_to"`
	IssuedAt       time.Time          `json:"issued_at"`
	TotalQuantity  int64              `json:"total_quantity"`
	Totals         []MetricQuantity   `json:"totals"`
	Companies      []CompanyStatement `json:"companies"`
	Issuer         Issuer             `json:"issuer"`
}

type CompanyStatement struct {
	CompanyID     uuid.UUID        `json:"company_id"`
	LegalName     string           `json:"legal_name"`
	TradeName     *string          `json:"trade_name,omitempty"`
	CNPJ          string           `json:"cnpj"`
	TotalQuantity int64            `json:"total_quantity"`
	Metrics       []MetricQuantity `json:"metrics"`
}

type MetricQuantity struct {
	Code     string `json:"code"`
	Label    string `json:"label"`
	Unit     string `json:"unit"`
	Quantity int64  `json:"quantity"`
}

type Issuer struct {
	LegalName    string   `json:"legal_name"`
	TradeName    string   `json:"trade_name"`
	ProductName  string   `json:"product_name"`
	AddressLines []string `json:"address_lines,omitempty"`
	City         string   `json:"city,omitempty"`
	PostalCode   string   `json:"postal_code,omitempty"`
	Country      string   `json:"country,omitempty"`
	Email        string   `json:"email"`
	Website      string   `json:"website"`
}

// NovaConsulting is the legal issuer of Nexus consumption statements.
var NovaConsulting = Issuer{
	LegalName:   "Nova Consultoria em Tecnologia da Informação Ltda",
	TradeName:   "Nova Consulting",
	ProductName: "Nexus",
	Email:       "ti@novaconsulting.com.br",
	Website:     "novaconsulting.com.br",
}

type usageRow struct {
	CompanyID uuid.UUID
	Code      string
	Quantity  int64
}
