// Package inbound implements the fiscal inbound orchestrator: scenario
// resolution, vendor/material/purchase-order matching, configurable
// validations, and an execution plan that drives SAP posting — on top of
// the generic organization_documents/organization_nfe envelope owned by
// package fiscal.
package inbound

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Scenario is the resolution key described in spec §6-7: the most specific
// active row matching (company, document_model, purchase_order_type, cfop,
// vendor_cnpj, plant) wins; nil fields act as wildcards.
type Scenario struct {
	ID                     uuid.UUID  `json:"id"`
	OrganizationID         uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID  uuid.UUID  `json:"organization_company_id"`
	DocumentModel          *string    `json:"document_model,omitempty"`
	PurchaseOrderType      *string    `json:"purchase_order_type,omitempty"`
	CFOP                   *string    `json:"cfop,omitempty"`
	VendorCNPJ             *string    `json:"vendor_cnpj,omitempty"`
	Plant                  *string    `json:"plant,omitempty"`
	PurchasingOrganization *string    `json:"purchasing_organization,omitempty"`
	ProcessTemplateCode    string     `json:"process_template_code"`
	IsActive               bool       `json:"is_active"`
	ValidFrom              time.Time  `json:"valid_from"`
	ValidUntil             *time.Time `json:"valid_until,omitempty"`
	CreatedByUserID        *uuid.UUID `json:"created_by_user_id,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

// ScenarioRule is the 1:1 configuration payload for a Scenario (spec §10,
// §21, §25, §27-29).
type ScenarioRule struct {
	ScenarioID uuid.UUID `json:"scenario_id"`

	POReferencePolicy string `json:"po_reference_policy"`
	POReferenceLevel  string `json:"po_reference_level"`
	POMissingAction   string `json:"po_missing_action"`
	POResolutionMode  string `json:"po_resolution_mode"`
	PONotFoundAction  string `json:"po_not_found_action"`

	ValidateVendor        bool   `json:"validate_vendor"`
	VendorFailureAction   string `json:"vendor_failure_action"`
	VendorOverrideAllowed bool   `json:"vendor_override_allowed"`

	ValidateMaterial        bool   `json:"validate_material"`
	MaterialFailureAction   string `json:"material_failure_action"`
	MaterialOverrideAllowed bool   `json:"material_override_allowed"`

	ValidateQuantity         bool    `json:"validate_quantity"`
	QuantityTolerancePercent float64 `json:"quantity_tolerance_percent"`

	ValidatePrice         bool    `json:"validate_price"`
	PriceTolerancePercent float64 `json:"price_tolerance_percent"`

	ValidateTax      bool   `json:"validate_tax"`
	TaxFailureAction string `json:"tax_failure_action"`

	ReceiptMode              string `json:"receipt_mode"`
	InboundDeliveryMode      string `json:"inbound_delivery_mode"`
	GoodsReceiptMode         string `json:"goods_receipt_mode"`
	GoodsReceiptMovementType string `json:"goods_receipt_movement_type"`
	SupplierInvoiceMode      string `json:"supplier_invoice_mode"`

	NotifyOnReject           bool `json:"notify_on_reject"`
	CreateOccurrenceOnReject bool `json:"create_occurrence_on_reject"`
	NotifyVendorOnReject     bool `json:"notify_vendor_on_reject"`
	SefazEventOnReject       bool `json:"sefaz_event_on_reject"`

	ResponsibleEmails []string `json:"responsible_emails"`

	ConfigurationJSON json.RawMessage `json:"configuration_json,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ScenarioWithRule is the read/write shape exposed by the API — a scenario
// is meaningless to a caller without its rule, so they are always read and
// written together.
type ScenarioWithRule struct {
	Scenario Scenario     `json:"scenario"`
	Rule     ScenarioRule `json:"rule"`
}

// Item is one organization_nfe_items row — the canonical, never-overwritten
// view of a document line (spec §5.1/§49-50).
type Item struct {
	ID                            uuid.UUID `json:"id"`
	OrganizationID                uuid.UUID `json:"organization_id"`
	OrganizationDocumentID        uuid.UUID `json:"organization_document_id"`
	ItemNumber                    int       `json:"item_number"`
	SupplierMaterialCode          *string   `json:"supplier_material_code,omitempty"`
	Description                   *string   `json:"description,omitempty"`
	NCM                           *string   `json:"ncm,omitempty"`
	CFOP                          *string   `json:"cfop,omitempty"`
	Quantity                      float64   `json:"quantity"`
	Unit                          *string   `json:"unit,omitempty"`
	UnitPrice                     float64   `json:"unit_price"`
	TotalAmount                   float64   `json:"total_amount"`
	PurchaseOrderReferenceRaw     *string   `json:"purchase_order_reference_raw,omitempty"`
	PurchaseOrderItemReferenceRaw *string   `json:"purchase_order_item_reference_raw,omitempty"`
	ResolvedMaterialCode          *string   `json:"resolved_material_code,omitempty"`
	ResolvedPurchaseOrderNumber   *string   `json:"resolved_purchase_order_number,omitempty"`
	ResolvedPurchaseOrderItem     *string    `json:"resolved_purchase_order_item,omitempty"`
	Taxes                         *ItemTaxes `json:"taxes,omitempty"`
	Status                        string     `json:"status"`
	CreatedAt                     time.Time  `json:"created_at"`
	UpdatedAt                     time.Time  `json:"updated_at"`
}

// Match is one organization_document_matches row — the "resolution SAP"
// view (spec §5.2/§51). OrganizationNFeItemID is nil for document-level
// matches (vendor).
type Match struct {
	ID                     uuid.UUID  `json:"id"`
	OrganizationID         uuid.UUID  `json:"organization_id"`
	OrganizationDocumentID uuid.UUID  `json:"organization_document_id"`
	OrganizationNFeItemID  *uuid.UUID `json:"organization_nfe_item_id,omitempty"`
	MatchType              string     `json:"match_type"`
	SourceValue            *string    `json:"source_value,omitempty"`
	ResolvedValue          *string    `json:"resolved_value,omitempty"`
	Strategy               *string    `json:"strategy,omitempty"`
	Confidence             *float64   `json:"confidence,omitempty"`
	Status                 string     `json:"status"`
	CreatedAt              time.Time  `json:"created_at"`
}

// Validation is one organization_document_validations row (spec §52).
type Validation struct {
	ID                         uuid.UUID  `json:"id"`
	OrganizationID             uuid.UUID  `json:"organization_id"`
	OrganizationDocumentID     uuid.UUID  `json:"organization_document_id"`
	OrganizationNFeItemID      *uuid.UUID `json:"organization_nfe_item_id,omitempty"`
	ValidationType             string     `json:"validation_type"`
	Status                     string     `json:"status"`
	Severity                   string     `json:"severity"`
	ExpectedValue              *string    `json:"expected_value,omitempty"`
	ActualValue                *string    `json:"actual_value,omitempty"`
	Message                    *string    `json:"message,omitempty"`
	OrganizationScenarioRuleID *uuid.UUID `json:"organization_inbound_scenario_id,omitempty"`
	CreatedAt                  time.Time  `json:"created_at"`
}

// Override is one organization_document_overrides row — the "decision" view
// (spec §5.3/§53). Never mutates Item/original XML data, only records the
// operator's decision on top of it.
type Override struct {
	ID                     uuid.UUID  `json:"id"`
	OrganizationID         uuid.UUID  `json:"organization_id"`
	OrganizationDocumentID uuid.UUID  `json:"organization_document_id"`
	OrganizationNFeItemID  *uuid.UUID `json:"organization_nfe_item_id,omitempty"`
	OverrideType           string     `json:"override_type"`
	OriginalValue          *string    `json:"original_value,omitempty"`
	OverrideValue          string     `json:"override_value"`
	Reason                 string     `json:"reason"`
	CreatedByUserID        uuid.UUID  `json:"created_by_user_id"`
	ApprovedByUserID       *uuid.UUID `json:"approved_by_user_id,omitempty"`
	CreatedAt              time.Time  `json:"created_at"`
}

// VendorMaterialMapping is a reusable De/Para entry (spec §19) — once a user
// overrides a material for a vendor+supplier_material_code, later documents
// from the same vendor resolve automatically.
type VendorMaterialMapping struct {
	ID                    uuid.UUID  `json:"id"`
	OrganizationID        uuid.UUID  `json:"organization_id"`
	OrganizationCompanyID *uuid.UUID `json:"organization_company_id,omitempty"`
	VendorCNPJ            string     `json:"vendor_cnpj"`
	SupplierMaterialCode  string     `json:"supplier_material_code"`
	ResolvedMaterialCode  string     `json:"resolved_material_code"`
	CreatedByUserID       *uuid.UUID `json:"created_by_user_id,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// ExecutionPlan is one organization_execution_plans row (spec §30/§54).
type ExecutionPlan struct {
	ID                     uuid.UUID `json:"id"`
	OrganizationID         uuid.UUID `json:"organization_id"`
	OrganizationDocumentID uuid.UUID `json:"organization_document_id"`
	Version                int       `json:"version"`
	Status                 string    `json:"status"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// PlanStep is one organization_execution_plan_steps row (spec §31/§55).
type PlanStep struct {
	ID                     uuid.UUID       `json:"id"`
	OrganizationID         uuid.UUID       `json:"organization_id"`
	ExecutionPlanID        uuid.UUID       `json:"execution_plan_id"`
	OrganizationDocumentID uuid.UUID       `json:"organization_document_id"`
	Sequence               int             `json:"sequence"`
	StepType               string          `json:"step_type"`
	Mode                   string          `json:"mode"`
	Status                 string          `json:"status"`
	DependencyStepID       *uuid.UUID      `json:"dependency_step_id,omitempty"`
	IdempotencyKey         string          `json:"idempotency_key"`
	RequestPayloadJSON     json.RawMessage `json:"request_payload_json,omitempty"`
	ResponsePayloadJSON    json.RawMessage `json:"response_payload_json,omitempty"`
	SAPDocumentNumber      *string         `json:"sap_document_number,omitempty"`
	ErrorCode              *string         `json:"error_code,omitempty"`
	ErrorMessageSanitized  *string         `json:"error_message_sanitized,omitempty"`
	StartedAt              *time.Time      `json:"started_at,omitempty"`
	FinishedAt             *time.Time      `json:"finished_at,omitempty"`
	CreatedAt              time.Time       `json:"created_at"`
	UpdatedAt              time.Time       `json:"updated_at"`
}

// OrchestrationView is the full read model for a document — the API's
// answer to spec §40 ("Interface — visão do documento").
type OrchestrationView struct {
	DocumentID  uuid.UUID         `json:"document_id"`
	Scenario    *ScenarioWithRule `json:"scenario,omitempty"`
	Items       []Item            `json:"items"`
	Matches     []Match           `json:"matches"`
	Validations []Validation      `json:"validations"`
	Overrides   []Override        `json:"overrides"`
	Plan        *ExecutionPlan    `json:"plan,omitempty"`
	Steps       []PlanStep        `json:"steps,omitempty"`
}
