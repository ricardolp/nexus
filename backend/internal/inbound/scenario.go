package inbound

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// ScenarioRuleInput is the writable shape of ScenarioRule — callers only
// set what they want to configure; ValidateScenarioRuleInput fills in the
// documented defaults for anything left blank/zero.
type ScenarioRuleInput struct {
	POReferencePolicy string
	POReferenceLevel  string
	POMissingAction   string
	POResolutionMode  string
	PONotFoundAction  string

	ValidateVendor        bool
	VendorFailureAction   string
	VendorOverrideAllowed bool

	ValidateMaterial        bool
	MaterialFailureAction   string
	MaterialOverrideAllowed bool

	ValidateQuantity         bool
	QuantityTolerancePercent float64

	ValidatePrice         bool
	PriceTolerancePercent float64

	ValidateTax      bool
	TaxFailureAction string

	ReceiptMode              string
	InboundDeliveryMode      string
	GoodsReceiptMode         string
	GoodsReceiptMovementType string
	SupplierInvoiceMode      string

	NotifyOnReject           bool
	CreateOccurrenceOnReject bool
	NotifyVendorOnReject     bool
	SefazEventOnReject       bool

	ResponsibleEmails []string

	ConfigurationJSON json.RawMessage
}

type CreateScenarioInput struct {
	OrganizationID         uuid.UUID
	OrganizationCompanyID  uuid.UUID
	DocumentModel          string
	PurchaseOrderType      string
	CFOP                   string
	VendorCNPJ             string
	Plant                  string
	PurchasingOrganization string
	ProcessTemplateCode    string
	Rule                   ScenarioRuleInput
	ActorUserID            uuid.UUID
}

type UpdateScenarioInput struct {
	OrganizationID         uuid.UUID
	ID                     uuid.UUID
	OrganizationCompanyID  uuid.UUID
	DocumentModel          string
	PurchaseOrderType      string
	CFOP                   string
	VendorCNPJ             string
	Plant                  string
	PurchasingOrganization string
	ProcessTemplateCode    string
	IsActive               bool
	Rule                   ScenarioRuleInput
	ActorUserID            uuid.UUID
}

// ScenarioCriteria is the subset of a classified document used to resolve
// which scenario applies (spec §6-7).
type ScenarioCriteria struct {
	DocumentModel          string
	PurchaseOrderType      string
	CFOP                   string
	VendorCNPJ             string
	Plant                  string
	PurchasingOrganization string
}

func (s *Service) CreateScenario(ctx context.Context, in CreateScenarioInput) (*ScenarioWithRule, error) {
	if err := validateScenarioTemplate(in.ProcessTemplateCode); err != nil {
		return nil, err
	}
	rule, err := normalizeScenarioRule(in.Rule)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	scenario := Scenario{
		ID:                     ids.New(),
		OrganizationID:         in.OrganizationID,
		OrganizationCompanyID:  in.OrganizationCompanyID,
		DocumentModel:          nullEmptyStr(in.DocumentModel),
		PurchaseOrderType:      nullEmptyStr(in.PurchaseOrderType),
		CFOP:                   nullEmptyStr(in.CFOP),
		VendorCNPJ:             nullEmptyStr(in.VendorCNPJ),
		Plant:                  nullEmptyStr(in.Plant),
		PurchasingOrganization: nullEmptyStr(in.PurchasingOrganization),
		ProcessTemplateCode:    in.ProcessTemplateCode,
		IsActive:               true,
		ValidFrom:              now,
		CreatedByUserID:        &in.ActorUserID,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	rule.ScenarioID = scenario.ID
	rule.CreatedAt = now
	rule.UpdatedAt = now

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			insert into organization_inbound_scenarios (
				id, organization_id, organization_company_id, document_model, purchase_order_type,
				cfop, vendor_cnpj, plant, purchasing_organization, process_template_code,
				is_active, valid_from, created_by_user_id, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		`, scenario.ID, scenario.OrganizationID, scenario.OrganizationCompanyID, scenario.DocumentModel, scenario.PurchaseOrderType,
			scenario.CFOP, scenario.VendorCNPJ, scenario.Plant, scenario.PurchasingOrganization, scenario.ProcessTemplateCode,
			scenario.IsActive, scenario.ValidFrom, scenario.CreatedByUserID, now, now); err != nil {
			return err
		}
		if err := insertScenarioRule(ctx, tx, in.OrganizationID, rule); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound_scenario.create",
			ResourceType:   "organization_inbound_scenarios",
			ResourceID:     scenario.ID.String(),
			After:          scenario,
		})
	})
	if err != nil {
		return nil, err
	}
	return &ScenarioWithRule{Scenario: scenario, Rule: rule}, nil
}

func (s *Service) UpdateScenario(ctx context.Context, in UpdateScenarioInput) (*ScenarioWithRule, error) {
	if err := validateScenarioTemplate(in.ProcessTemplateCode); err != nil {
		return nil, err
	}
	rule, err := normalizeScenarioRule(in.Rule)
	if err != nil {
		return nil, err
	}
	existing, err := s.GetScenario(ctx, in.OrganizationID, in.ID)
	if err != nil {
		return nil, err
	}
	if in.OrganizationCompanyID == uuid.Nil {
		return nil, domainerr.Validation("invalid_company_id", "organization_company_id is required")
	}
	rule.ScenarioID = in.ID
	now := time.Now().UTC()
	rule.UpdatedAt = now

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update organization_inbound_scenarios
			set organization_company_id = $3,
			    document_model = $4,
			    purchase_order_type = $5,
			    cfop = $6,
			    vendor_cnpj = $7,
			    plant = $8,
			    purchasing_organization = $9,
			    process_template_code = $10,
			    is_active = $11,
			    updated_at = $12
			where organization_id = $1 and id = $2
		`, in.OrganizationID, in.ID, in.OrganizationCompanyID,
			nullEmptyStr(in.DocumentModel), nullEmptyStr(in.PurchaseOrderType), nullEmptyStr(in.CFOP),
			nullEmptyStr(in.VendorCNPJ), nullEmptyStr(in.Plant), nullEmptyStr(in.PurchasingOrganization),
			in.ProcessTemplateCode, in.IsActive, now); err != nil {
			return err
		}
		if err := updateScenarioRule(ctx, tx, rule); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound_scenario.update",
			ResourceType:   "organization_inbound_scenarios",
			ResourceID:     in.ID.String(),
			Before:         existing,
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetScenario(ctx, in.OrganizationID, in.ID)
}

// DeleteScenario deactivates a scenario (soft delete): scenarios may be
// referenced by past validations (scenario_rule_id), so rows are never hard
// deleted, only excluded from future resolution.
func (s *Service) DeleteScenario(ctx context.Context, organizationID, id, actorUserID uuid.UUID) error {
	existing, err := s.GetScenario(ctx, organizationID, id)
	if err != nil {
		return err
	}
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			update organization_inbound_scenarios set is_active = false, updated_at = now()
			where organization_id = $1 and id = $2
		`, organizationID, id); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "inbound_scenario.deactivate",
			ResourceType:   "organization_inbound_scenarios",
			ResourceID:     id.String(),
			Before:         existing,
		})
	})
}

func (s *Service) ListScenarios(ctx context.Context, organizationID uuid.UUID) ([]ScenarioWithRule, error) {
	rows, err := s.pool.Query(ctx, `
		select `+scenarioColumns+`
		from organization_inbound_scenarios
		where organization_id = $1
		order by created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var scenarios []Scenario
	for rows.Next() {
		sc, err := scanScenario(rows)
		if err != nil {
			return nil, err
		}
		scenarios = append(scenarios, sc)
	}

	out := make([]ScenarioWithRule, 0, len(scenarios))
	for _, sc := range scenarios {
		rule, err := getScenarioRuleTx(ctx, s.pool, sc.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, ScenarioWithRule{Scenario: sc, Rule: *rule})
	}
	return out, nil
}

func (s *Service) GetScenario(ctx context.Context, organizationID, id uuid.UUID) (*ScenarioWithRule, error) {
	return getScenarioTx(ctx, s.pool, organizationID, id)
}

func getScenarioTx(ctx context.Context, tx dbtx, organizationID, id uuid.UUID) (*ScenarioWithRule, error) {
	row := tx.QueryRow(ctx, `
		select `+scenarioColumns+`
		from organization_inbound_scenarios
		where organization_id = $1 and id = $2
	`, organizationID, id)
	sc, err := scanScenario(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("scenario_not_found", "Inbound scenario not found")
		}
		return nil, err
	}
	rule, err := getScenarioRuleTx(ctx, tx, sc.ID)
	if err != nil {
		return nil, err
	}
	return &ScenarioWithRule{Scenario: sc, Rule: *rule}, nil
}

// ResolveScenario finds the most specific active scenario matching criteria
// (spec §7): every non-wildcard field on a candidate scenario must equal the
// corresponding criteria value; among candidates that qualify, the one
// matching the most fields wins, ties broken by most recently created.
func (s *Service) ResolveScenario(ctx context.Context, organizationID, companyID uuid.UUID, criteria ScenarioCriteria) (*ScenarioWithRule, error) {
	return resolveScenarioTx(ctx, s.pool, organizationID, companyID, criteria)
}

func resolveScenarioTx(ctx context.Context, tx dbtx, organizationID, companyID uuid.UUID, criteria ScenarioCriteria) (*ScenarioWithRule, error) {
	rows, err := tx.Query(ctx, `
		select `+scenarioColumns+`
		from organization_inbound_scenarios
		where organization_id = $1 and organization_company_id = $2 and is_active
		  and valid_from <= now() and (valid_until is null or valid_until > now())
	`, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	var candidates []Scenario
	for rows.Next() {
		sc, err := scanScenario(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		candidates = append(candidates, sc)
	}
	rows.Close()

	var best *Scenario
	bestScore := -1
	for i := range candidates {
		sc := &candidates[i]
		score, ok := scenarioMatchScore(sc, criteria)
		if !ok {
			continue
		}
		if score > bestScore || (score == bestScore && best != nil && sc.CreatedAt.After(best.CreatedAt)) {
			best = sc
			bestScore = score
		}
	}
	if best == nil {
		return nil, domainerr.NotFound("scenario_not_found", "No inbound scenario matches this document")
	}
	rule, err := getScenarioRuleTx(ctx, tx, best.ID)
	if err != nil {
		return nil, err
	}
	return &ScenarioWithRule{Scenario: *best, Rule: *rule}, nil
}

func scenarioMatchScore(sc *Scenario, c ScenarioCriteria) (score int, ok bool) {
	check := func(field *string, value string) bool {
		if field == nil {
			return true
		}
		if !strings.EqualFold(strings.TrimSpace(*field), strings.TrimSpace(value)) {
			return false
		}
		score++
		return true
	}
	if !check(sc.DocumentModel, c.DocumentModel) {
		return 0, false
	}
	if !check(sc.PurchaseOrderType, c.PurchaseOrderType) {
		return 0, false
	}
	if !check(sc.CFOP, c.CFOP) {
		return 0, false
	}
	if !check(sc.VendorCNPJ, c.VendorCNPJ) {
		return 0, false
	}
	if !check(sc.Plant, c.Plant) {
		return 0, false
	}
	if !check(sc.PurchasingOrganization, c.PurchasingOrganization) {
		return 0, false
	}
	return score, true
}

const scenarioColumns = `
	id, organization_id, organization_company_id, document_model, purchase_order_type,
	cfop, vendor_cnpj, plant, purchasing_organization, process_template_code,
	is_active, valid_from, valid_until, created_by_user_id, created_at, updated_at
`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanScenario(row rowScanner) (Scenario, error) {
	var sc Scenario
	err := row.Scan(
		&sc.ID, &sc.OrganizationID, &sc.OrganizationCompanyID, &sc.DocumentModel, &sc.PurchaseOrderType,
		&sc.CFOP, &sc.VendorCNPJ, &sc.Plant, &sc.PurchasingOrganization, &sc.ProcessTemplateCode,
		&sc.IsActive, &sc.ValidFrom, &sc.ValidUntil, &sc.CreatedByUserID, &sc.CreatedAt, &sc.UpdatedAt,
	)
	return sc, err
}

const scenarioRuleColumns = `
	organization_inbound_scenario_id, po_reference_policy, po_reference_level, po_missing_action,
	po_resolution_mode, po_not_found_action, validate_vendor, vendor_failure_action, vendor_override_allowed,
	validate_material, material_failure_action, material_override_allowed, validate_quantity,
	quantity_tolerance_percent, validate_price, price_tolerance_percent, validate_tax, tax_failure_action,
	receipt_mode, inbound_delivery_mode, goods_receipt_mode, goods_receipt_movement_type, supplier_invoice_mode,
	notify_on_reject, create_occurrence_on_reject, notify_vendor_on_reject, sefaz_event_on_reject,
	responsible_emails, configuration_json, created_at, updated_at
`

func getScenarioRuleTx(ctx context.Context, tx dbtx, scenarioID uuid.UUID) (*ScenarioRule, error) {
	row := tx.QueryRow(ctx, `select `+scenarioRuleColumns+` from organization_inbound_scenario_rules where organization_inbound_scenario_id = $1`, scenarioID)
	var r ScenarioRule
	err := row.Scan(
		&r.ScenarioID, &r.POReferencePolicy, &r.POReferenceLevel, &r.POMissingAction,
		&r.POResolutionMode, &r.PONotFoundAction, &r.ValidateVendor, &r.VendorFailureAction, &r.VendorOverrideAllowed,
		&r.ValidateMaterial, &r.MaterialFailureAction, &r.MaterialOverrideAllowed, &r.ValidateQuantity,
		&r.QuantityTolerancePercent, &r.ValidatePrice, &r.PriceTolerancePercent, &r.ValidateTax, &r.TaxFailureAction,
		&r.ReceiptMode, &r.InboundDeliveryMode, &r.GoodsReceiptMode, &r.GoodsReceiptMovementType, &r.SupplierInvoiceMode,
		&r.NotifyOnReject, &r.CreateOccurrenceOnReject, &r.NotifyVendorOnReject, &r.SefazEventOnReject,
		&r.ResponsibleEmails, &r.ConfigurationJSON, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, domainerr.NotFound("scenario_rule_not_found", "Scenario rule not found")
		}
		return nil, err
	}
	if r.ResponsibleEmails == nil {
		r.ResponsibleEmails = []string{}
	}
	return &r, nil
}

func insertScenarioRule(ctx context.Context, tx pgx.Tx, organizationID uuid.UUID, r ScenarioRule) error {
	_, err := tx.Exec(ctx, `
		insert into organization_inbound_scenario_rules (
			organization_inbound_scenario_id, organization_id, po_reference_policy, po_reference_level, po_missing_action,
			po_resolution_mode, po_not_found_action, validate_vendor, vendor_failure_action, vendor_override_allowed,
			validate_material, material_failure_action, material_override_allowed, validate_quantity,
			quantity_tolerance_percent, validate_price, price_tolerance_percent, validate_tax, tax_failure_action,
			receipt_mode, inbound_delivery_mode, goods_receipt_mode, goods_receipt_movement_type, supplier_invoice_mode,
			notify_on_reject, create_occurrence_on_reject, notify_vendor_on_reject, sefaz_event_on_reject,
			responsible_emails, configuration_json, created_at, updated_at
		) values (
			$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
		)
	`,
		r.ScenarioID, organizationID, r.POReferencePolicy, r.POReferenceLevel, r.POMissingAction,
		r.POResolutionMode, r.PONotFoundAction, r.ValidateVendor, r.VendorFailureAction, r.VendorOverrideAllowed,
		r.ValidateMaterial, r.MaterialFailureAction, r.MaterialOverrideAllowed, r.ValidateQuantity,
		r.QuantityTolerancePercent, r.ValidatePrice, r.PriceTolerancePercent, r.ValidateTax, r.TaxFailureAction,
		r.ReceiptMode, r.InboundDeliveryMode, r.GoodsReceiptMode, r.GoodsReceiptMovementType, r.SupplierInvoiceMode,
		r.NotifyOnReject, r.CreateOccurrenceOnReject, r.NotifyVendorOnReject, r.SefazEventOnReject,
		r.ResponsibleEmails, r.ConfigurationJSON, r.CreatedAt, r.UpdatedAt,
	)
	return err
}

func updateScenarioRule(ctx context.Context, tx pgx.Tx, r ScenarioRule) error {
	_, err := tx.Exec(ctx, `
		update organization_inbound_scenario_rules set
			po_reference_policy = $2, po_reference_level = $3, po_missing_action = $4,
			po_resolution_mode = $5, po_not_found_action = $6, validate_vendor = $7, vendor_failure_action = $8, vendor_override_allowed = $9,
			validate_material = $10, material_failure_action = $11, material_override_allowed = $12, validate_quantity = $13,
			quantity_tolerance_percent = $14, validate_price = $15, price_tolerance_percent = $16, validate_tax = $17, tax_failure_action = $18,
			receipt_mode = $19, inbound_delivery_mode = $20, goods_receipt_mode = $21, goods_receipt_movement_type = $22, supplier_invoice_mode = $23,
			notify_on_reject = $24, create_occurrence_on_reject = $25, notify_vendor_on_reject = $26, sefaz_event_on_reject = $27,
			responsible_emails = $28, configuration_json = $29, updated_at = $30
		where organization_inbound_scenario_id = $1
	`,
		r.ScenarioID, r.POReferencePolicy, r.POReferenceLevel, r.POMissingAction,
		r.POResolutionMode, r.PONotFoundAction, r.ValidateVendor, r.VendorFailureAction, r.VendorOverrideAllowed,
		r.ValidateMaterial, r.MaterialFailureAction, r.MaterialOverrideAllowed, r.ValidateQuantity,
		r.QuantityTolerancePercent, r.ValidatePrice, r.PriceTolerancePercent, r.ValidateTax, r.TaxFailureAction,
		r.ReceiptMode, r.InboundDeliveryMode, r.GoodsReceiptMode, r.GoodsReceiptMovementType, r.SupplierInvoiceMode,
		r.NotifyOnReject, r.CreateOccurrenceOnReject, r.NotifyVendorOnReject, r.SefazEventOnReject,
		r.ResponsibleEmails, r.ConfigurationJSON, r.UpdatedAt,
	)
	return err
}

func nullEmptyStr(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return &v
}
