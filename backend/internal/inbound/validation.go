package inbound

import (
	"context"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

// failureActionToStatus maps a scenario rule's *_failure_action (spec §21)
// to the validation status/severity recorded for the caller to react to.
// REJECT and BLOCK both produce a BLOCKED validation — the difference is in
// how the orchestrator reacts (REJECT also rejects the whole document,
// applied by the caller, not here).
func failureActionToStatus(action string) (status, severity string) {
	switch action {
	case FailureActionPass:
		return ValidationStatusPass, "info"
	case FailureActionWarn:
		return ValidationStatusWarning, "warning"
	case FailureActionBlock, FailureActionReject:
		return ValidationStatusBlocked, "error"
	case FailureActionWaitUser:
		return ValidationStatusActionRequired, "error"
	default:
		return ValidationStatusWarning, "warning"
	}
}

func validateVendor(ctx context.Context, tx dbtx, organizationID, documentID, scenarioID uuid.UUID, rule ScenarioRule, vendorMatch Match) (Validation, error) {
	v := Validation{
		OrganizationID:             organizationID,
		OrganizationDocumentID:     documentID,
		ValidationType:             ValidationTypeVendor,
		ExpectedValue:              vendorMatch.SourceValue,
		ActualValue:                vendorMatch.ResolvedValue,
		OrganizationScenarioRuleID: &scenarioID,
	}
	if !rule.ValidateVendor {
		v.Status, v.Severity = ValidationStatusSkipped, "info"
		return insertValidation(ctx, tx, v)
	}
	if vendorMatch.Status == MatchStatusMatched {
		v.Status, v.Severity = ValidationStatusPass, "info"
		return insertValidation(ctx, tx, v)
	}
	v.Status, v.Severity = failureActionToStatus(rule.VendorFailureAction)
	msg := "vendor match status: " + vendorMatch.Status
	v.Message = &msg
	return insertValidation(ctx, tx, v)
}

func validateMaterial(ctx context.Context, tx dbtx, organizationID, scenarioID uuid.UUID, rule ScenarioRule, item Item, materialMatch Match) (Validation, error) {
	itemID := item.ID
	v := Validation{
		OrganizationID:             organizationID,
		OrganizationDocumentID:     item.OrganizationDocumentID,
		OrganizationNFeItemID:      &itemID,
		ValidationType:             ValidationTypeMaterial,
		ExpectedValue:              materialMatch.SourceValue,
		ActualValue:                materialMatch.ResolvedValue,
		OrganizationScenarioRuleID: &scenarioID,
	}
	if !rule.ValidateMaterial {
		v.Status, v.Severity = ValidationStatusSkipped, "info"
		return insertValidation(ctx, tx, v)
	}
	if materialMatch.Status == MatchStatusMatched || materialMatch.Status == MatchStatusManualMap {
		v.Status, v.Severity = ValidationStatusPass, "info"
		return insertValidation(ctx, tx, v)
	}
	v.Status, v.Severity = failureActionToStatus(rule.MaterialFailureAction)
	msg := "material match status: " + materialMatch.Status
	v.Message = &msg
	return insertValidation(ctx, tx, v)
}

func validatePOReference(ctx context.Context, tx dbtx, organizationID, scenarioID uuid.UUID, item Item, resolution POResolution) (Validation, error) {
	itemID := item.ID
	v := Validation{
		OrganizationID:             organizationID,
		OrganizationDocumentID:     item.OrganizationDocumentID,
		OrganizationNFeItemID:      &itemID,
		ValidationType:             ValidationTypePOReference,
		ExpectedValue:              item.PurchaseOrderReferenceRaw,
		OrganizationScenarioRuleID: &scenarioID,
	}
	switch resolution.Outcome {
	case "resolved", "created", "continue_without_po":
		v.Status, v.Severity = ValidationStatusPass, "info"
	case "missing_wait", "not_found_wait":
		v.Status, v.Severity = ValidationStatusActionRequired, "error"
	case "missing_reject", "not_found_reject":
		v.Status, v.Severity = ValidationStatusBlocked, "error"
	default:
		v.Status, v.Severity = ValidationStatusActionRequired, "error"
	}
	if resolution.ResolvedNumber != "" {
		v.ActualValue = &resolution.ResolvedNumber
	}
	return insertValidation(ctx, tx, v)
}

// validateQuantityAndPrice re-fetches the resolved purchase-order line (no
// separate PO cache table is kept, see model notes) to compare against the
// tolerance configured on the scenario rule (spec §21, quantity/price).
// Skipped when no purchase order was resolved for the item.
func validateQuantityAndPrice(ctx context.Context, tx dbtx, adapter sap.Adapter, organizationID, scenarioID uuid.UUID, rule ScenarioRule, item Item, vendorCNPJ, branchCNPJ string) ([]Validation, error) {
	var out []Validation
	itemID := item.ID

	if item.ResolvedPurchaseOrderNumber == nil {
		for _, vt := range []string{ValidationTypeQuantity, ValidationTypePrice} {
			v := Validation{
				OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &itemID,
				ValidationType: vt, Status: ValidationStatusSkipped, Severity: "info",
				OrganizationScenarioRuleID: &scenarioID,
			}
			msg := "no purchase order resolved for this item"
			v.Message = &msg
			saved, err := insertValidation(ctx, tx, v)
			if err != nil {
				return nil, err
			}
			out = append(out, saved)
		}
		return out, nil
	}

	orders, err := adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
		VendorCNPJ:    vendorCNPJ,
		BranchCNPJ:    branchCNPJ,
		PurchaseOrder: *item.ResolvedPurchaseOrderNumber,
	})
	if err != nil {
		return nil, wrapAdapterErr(err)
	}
	var line *sap.PurchaseOrderItem
	for _, po := range orders {
		for i := range po.Items {
			if item.ResolvedPurchaseOrderItem == nil || po.Items[i].ItemNumber == *item.ResolvedPurchaseOrderItem {
				line = &po.Items[i]
				break
			}
		}
	}

	if rule.ValidateQuantity {
		v, err := toleranceValidation(ctx, tx, organizationID, scenarioID, item, ValidationTypeQuantity, line, rule.QuantityTolerancePercent,
			item.Quantity, func(l *sap.PurchaseOrderItem) float64 { return l.Quantity })
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if rule.ValidatePrice {
		v, err := toleranceValidation(ctx, tx, organizationID, scenarioID, item, ValidationTypePrice, line, rule.PriceTolerancePercent,
			item.UnitPrice, func(l *sap.PurchaseOrderItem) float64 { return l.UnitPrice })
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func toleranceValidation(ctx context.Context, tx dbtx, organizationID, scenarioID uuid.UUID, item Item, validationType string, line *sap.PurchaseOrderItem, tolerancePercent, actual float64, expectedFn func(*sap.PurchaseOrderItem) float64) (Validation, error) {
	itemID := item.ID
	v := Validation{
		OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &itemID,
		ValidationType: validationType, OrganizationScenarioRuleID: &scenarioID,
	}
	if line == nil {
		v.Status, v.Severity = ValidationStatusActionRequired, "error"
		msg := "purchase order line not found for comparison"
		v.Message = &msg
		return insertValidation(ctx, tx, v)
	}
	expected := expectedFn(line)
	expectedStr := formatFloat(expected)
	actualStr := formatFloat(actual)
	v.ExpectedValue = &expectedStr
	v.ActualValue = &actualStr

	if withinTolerance(expected, actual, tolerancePercent) {
		v.Status, v.Severity = ValidationStatusPass, "info"
	} else {
		v.Status, v.Severity = ValidationStatusWarning, "warning"
	}
	return insertValidation(ctx, tx, v)
}

func withinTolerance(expected, actual, tolerancePercent float64) bool {
	if expected == 0 {
		return actual == 0
	}
	diff := (actual - expected) / expected
	if diff < 0 {
		diff = -diff
	}
	return diff*100 <= tolerancePercent
}

// validateTax is a placeholder: the orchestrator does not extract ICMS/IPI/
// PIS/COFINS/ISS/IBS/CBS fields from the NF-e yet (spec §21 "Impostos"),
// so it is always SKIPPED — documented gap, not a silent PASS.
func validateTax(ctx context.Context, tx dbtx, organizationID, documentID, scenarioID uuid.UUID, rule ScenarioRule) (Validation, error) {
	v := Validation{
		OrganizationID: organizationID, OrganizationDocumentID: documentID,
		ValidationType: ValidationTypeTax, OrganizationScenarioRuleID: &scenarioID,
		Status: ValidationStatusSkipped, Severity: "info",
	}
	msg := "tax field extraction is not implemented yet"
	v.Message = &msg
	if !rule.ValidateTax {
		return insertValidation(ctx, tx, v)
	}
	return insertValidation(ctx, tx, v)
}
