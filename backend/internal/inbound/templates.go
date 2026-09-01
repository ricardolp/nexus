package inbound

import (
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// Process template codes (spec §8) — a fixed Go-side catalog rather than a
// database table: declarative, per-tenant flow authoring (spec §56-57) is
// out of scope for this iteration, but a scenario can still override any
// individual step's mode via ScenarioRule (spec: "cada cenário escolhe um
// template e pode sobrescrever etapas").
const (
	TemplateStandardPurchase = "STANDARD_PURCHASE"
	TemplateEWMPurchase      = "EWM_PURCHASE"
	TemplateDirectGR         = "DIRECT_GR"
	TemplateService          = "SERVICE"
	TemplateFIOnly           = "FI_ONLY"
)

// ProcessTemplates maps each template code to its ordered step list
// (spec §8). RESOLVE_VENDOR/RESOLVE_MATERIAL/SEARCH_PURCHASE_ORDER are
// implicit prerequisites of every template that touches a purchase order
// and are added by BuildExecutionPlan, not listed here.
var ProcessTemplates = map[string][]string{
	TemplateStandardPurchase: {
		StepCreatePurchaseOrder,
		StepPostGoodsReceipt,
		StepPostSupplierInvoice,
	},
	TemplateEWMPurchase: {
		StepCreatePurchaseOrder,
		StepCreateInboundDelivery,
		StepPostGoodsReceipt,
		StepPostSupplierInvoice,
	},
	TemplateDirectGR: {
		StepCreatePurchaseOrder,
		StepPostGoodsReceipt,
		StepPostSupplierInvoice,
	},
	TemplateService: {
		StepCreatePurchaseOrder,
		StepCreateServiceEntry,
		StepPostSupplierInvoice,
	},
	TemplateFIOnly: {
		StepPostAccountingDocument,
	},
}

func validateScenarioTemplate(code string) error {
	if _, ok := ProcessTemplates[code]; !ok {
		return domainerr.Validation("invalid_process_template", "unknown process_template_code: "+code)
	}
	return nil
}

var (
	poReferencePolicies = set(POReferencePolicyRequired, POReferencePolicyOptional, POReferencePolicyIgnore)
	poReferenceLevels   = set(POReferenceLevelDocument, POReferenceLevelItem, POReferenceLevelDocumentOrItem)
	poMissingActions    = set(POMissingActionReject, POMissingActionWaitUser, POMissingActionSearchSAP, POMissingActionCreatePO, POMissingActionContinueWithoutPO)
	poResolutionModes   = set(POResolutionRequiredExisting, POResolutionFindExisting, POResolutionFindOrCreate, POResolutionManualSelection, POResolutionCreate, POResolutionOptional, POResolutionNone)
	poNotFoundActions   = set(PONotFoundReject, PONotFoundWaitUser, PONotFoundCreatePO, PONotFoundSearchAlternative)
	failureActions      = set(FailureActionPass, FailureActionWarn, FailureActionBlock, FailureActionWaitUser, FailureActionReject)
	receiptModes        = set(ReceiptModeInboundDelivery, ReceiptModeDirectGoodsReceipt, ReceiptModeEWM, ReceiptModeServiceEntry, ReceiptModeNoGoodsReceipt, ReceiptModeManual)
	stepConfigModes     = set(StepConfigDisabled, StepConfigAuto, StepConfigManual, StepConfigConditional)
)

func set(values ...string) map[string]struct{} {
	m := make(map[string]struct{}, len(values))
	for _, v := range values {
		m[v] = struct{}{}
	}
	return m
}

// normalizeScenarioRule fills in the same conservative defaults as the
// migration's column defaults (manual/wait-user leaning) for anything left
// blank, and rejects any explicitly set value outside the documented enum.
func normalizeScenarioRule(in ScenarioRuleInput) (ScenarioRule, error) {
	r := ScenarioRule{
		POReferencePolicy:        defaultStr(in.POReferencePolicy, POReferencePolicyOptional),
		POReferenceLevel:         defaultStr(in.POReferenceLevel, POReferenceLevelDocumentOrItem),
		POMissingAction:          defaultStr(in.POMissingAction, POMissingActionWaitUser),
		POResolutionMode:         defaultStr(in.POResolutionMode, POResolutionFindExisting),
		PONotFoundAction:         defaultStr(in.PONotFoundAction, PONotFoundWaitUser),
		ValidateVendor:           in.ValidateVendor,
		VendorFailureAction:      defaultStr(in.VendorFailureAction, FailureActionBlock),
		VendorOverrideAllowed:    in.VendorOverrideAllowed,
		ValidateMaterial:         in.ValidateMaterial,
		MaterialFailureAction:    defaultStr(in.MaterialFailureAction, FailureActionWaitUser),
		MaterialOverrideAllowed:  in.MaterialOverrideAllowed,
		ValidateQuantity:         in.ValidateQuantity,
		QuantityTolerancePercent: in.QuantityTolerancePercent,
		ValidatePrice:            in.ValidatePrice,
		PriceTolerancePercent:    in.PriceTolerancePercent,
		ValidateTax:              in.ValidateTax,
		TaxFailureAction:         defaultStr(in.TaxFailureAction, FailureActionWarn),
		ReceiptMode:              defaultStr(in.ReceiptMode, ReceiptModeDirectGoodsReceipt),
		InboundDeliveryMode:      defaultStr(in.InboundDeliveryMode, StepConfigDisabled),
		GoodsReceiptMode:         defaultStr(in.GoodsReceiptMode, StepConfigManual),
		GoodsReceiptMovementType: defaultStr(in.GoodsReceiptMovementType, "101"),
		SupplierInvoiceMode:      defaultStr(in.SupplierInvoiceMode, StepConfigManual),
		NotifyOnReject:           in.NotifyOnReject,
		CreateOccurrenceOnReject: in.CreateOccurrenceOnReject,
		NotifyVendorOnReject:     in.NotifyVendorOnReject,
		SefazEventOnReject:       in.SefazEventOnReject,
		ConfigurationJSON:        in.ConfigurationJSON,
	}
	emails, err := NormalizeResponsibleEmails(in.ResponsibleEmails)
	if err != nil {
		return ScenarioRule{}, err
	}
	r.ResponsibleEmails = emails
	if len(r.ConfigurationJSON) == 0 {
		r.ConfigurationJSON = []byte(`{}`)
	}

	checks := []struct {
		field string
		value string
		set   map[string]struct{}
	}{
		{"po_reference_policy", r.POReferencePolicy, poReferencePolicies},
		{"po_reference_level", r.POReferenceLevel, poReferenceLevels},
		{"po_missing_action", r.POMissingAction, poMissingActions},
		{"po_resolution_mode", r.POResolutionMode, poResolutionModes},
		{"po_not_found_action", r.PONotFoundAction, poNotFoundActions},
		{"vendor_failure_action", r.VendorFailureAction, failureActions},
		{"material_failure_action", r.MaterialFailureAction, failureActions},
		{"tax_failure_action", r.TaxFailureAction, failureActions},
		{"receipt_mode", r.ReceiptMode, receiptModes},
		{"inbound_delivery_mode", r.InboundDeliveryMode, stepConfigModes},
		{"goods_receipt_mode", r.GoodsReceiptMode, stepConfigModes},
		{"supplier_invoice_mode", r.SupplierInvoiceMode, stepConfigModes},
	}
	for _, c := range checks {
		if _, ok := c.set[c.value]; !ok {
			return ScenarioRule{}, domainerr.Validation("invalid_scenario_rule", "invalid value for "+c.field+": "+c.value)
		}
	}
	if r.QuantityTolerancePercent < 0 || r.PriceTolerancePercent < 0 {
		return ScenarioRule{}, domainerr.Validation("invalid_scenario_rule", "tolerance percentages must not be negative")
	}
	return r, nil
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
