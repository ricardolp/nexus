package inbound

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

// POResolution is the outcome of resolving one item's purchase-order
// reference against the scenario's PurchaseOrderStrategy (spec §10-13,
// §25-26). Outcome drives whether the item/document should proceed,
// block, or be rejected outright.
type POResolution struct {
	Match          *Match
	ResolvedNumber string
	ResolvedItem   string
	ResolvedUnit   string
	Outcome        string // resolved | created | continue_without_po | missing_reject | missing_wait | not_found_reject | not_found_wait
}

// matchPurchaseOrder implements spec §10-13/§25: policy IGNORE skips
// matching entirely; a missing reference is handled purely by
// po_missing_action (no SAP call for REJECT/WAIT_USER, per spec §11 "neste
// cenário, nenhuma consulta SAP de pedido deve ser realizada"); a reference
// that does not resolve in SAP is handled by po_not_found_action, with
// CREATE_PO gated by po_resolution_mode actually allowing creation.
func matchPurchaseOrder(ctx context.Context, tx dbtx, adapter sap.Adapter, organizationID uuid.UUID, scenario Scenario, rule ScenarioRule, vendorCNPJ, branchCNPJ, vendorCode string, item Item) (POResolution, error) {
	_ = vendorCode
	if rule.POReferencePolicy == POReferencePolicyIgnore {
		return POResolution{Outcome: "continue_without_po"}, nil
	}

	// Explicit operator decision must survive Reprocess.
	if poNumber, ok, err := lookupLatestItemOverride(ctx, tx, organizationID, item.OrganizationDocumentID, item.ID, OverrideTypePurchaseOrder); err != nil {
		return POResolution{}, err
	} else if ok && poNumber != "" {
		poItem, _, _ := lookupLatestItemOverride(ctx, tx, organizationID, item.OrganizationDocumentID, item.ID, OverrideTypePurchaseOrderItem)
		if poItem == "" {
			poItem = strVal(item.PurchaseOrderItemReferenceRaw)
		}
		m, err := insertMatch(ctx, tx, Match{
			OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &item.ID,
			MatchType: MatchTypePurchaseOrder, SourceValue: nullEmptyStr(strVal(item.PurchaseOrderReferenceRaw)),
			ResolvedValue: nullEmptyStr(poNumber), Strategy: nullEmptyStr("manual_override"), Confidence: floatPtr(1), Status: MatchStatusManualMap,
		})
		unit := lookupPOLineUnit(ctx, adapter, vendorCNPJ, branchCNPJ, poNumber, poItem)
		return POResolution{Match: &m, ResolvedNumber: poNumber, ResolvedItem: poItem, ResolvedUnit: unit, Outcome: "resolved"}, err
	}

	rawNumber := strVal(item.PurchaseOrderReferenceRaw)
	rawItem := strVal(item.PurchaseOrderItemReferenceRaw)

	if rawNumber == "" {
		switch rule.POMissingAction {
		case POMissingActionContinueWithoutPO:
			return POResolution{Outcome: "continue_without_po"}, nil
		case POMissingActionReject:
			m, err := insertMatch(ctx, tx, Match{
				OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &item.ID,
				MatchType: MatchTypePurchaseOrder, Strategy: nullEmptyStr("missing_reference"), Status: MatchStatusNotFound,
			})
			return POResolution{Match: &m, Outcome: "missing_reject"}, err
		case POMissingActionWaitUser:
			m, err := insertMatch(ctx, tx, Match{
				OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &item.ID,
				MatchType: MatchTypePurchaseOrder, Strategy: nullEmptyStr("missing_reference"), Status: MatchStatusNotFound,
			})
			return POResolution{Match: &m, Outcome: "missing_wait"}, err
		case POMissingActionSearchSAP, POMissingActionCreatePO:
			// fall through: search SAP without a known PO number (vendor-only)
		}
	}

	orders, err := adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
		VendorCNPJ:    vendorCNPJ,
		BranchCNPJ:    branchCNPJ,
		PurchaseOrder: rawNumber,
	})
	if err != nil {
		return POResolution{}, wrapAdapterErr(err)
	}

	if po, line, found := findPOLine(orders, rawNumber, rawItem, rule.POReferenceLevel); found {
		lineItem := ""
		lineUnit := ""
		if line != nil {
			lineItem = line.ItemNumber
			lineUnit = strings.TrimSpace(line.Unit)
		}
		m, err := insertMatch(ctx, tx, Match{
			OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &item.ID,
			MatchType: MatchTypePurchaseOrder, SourceValue: nullEmptyStr(rawNumber), ResolvedValue: nullEmptyStr(po.Number),
			Strategy: nullEmptyStr("xped_nitem"), Confidence: floatPtr(1), Status: MatchStatusMatched,
		})
		return POResolution{Match: &m, ResolvedNumber: po.Number, ResolvedItem: lineItem, ResolvedUnit: lineUnit, Outcome: "resolved"}, err
	}

	notFoundMatch, err := insertMatch(ctx, tx, Match{
		OrganizationID: organizationID, OrganizationDocumentID: item.OrganizationDocumentID, OrganizationNFeItemID: &item.ID,
		MatchType: MatchTypePurchaseOrder, SourceValue: nullEmptyStr(rawNumber), Strategy: nullEmptyStr("xped_nitem"), Status: MatchStatusNotFound,
	})
	if err != nil {
		return POResolution{}, err
	}

	switch rule.PONotFoundAction {
	case PONotFoundCreatePO:
		// PO creation is a mutating SAP call and is deferred to the
		// execution plan's CREATE_PURCHASE_ORDER step (spec §37/§38 apply
		// to it like any other posting) — matching only decides that a PO
		// still needs to be created, never creates it inline.
		if rule.POResolutionMode != POResolutionFindOrCreate && rule.POResolutionMode != POResolutionCreate {
			return POResolution{Match: &notFoundMatch, Outcome: "not_found_wait"}, nil
		}
		return POResolution{Match: &notFoundMatch, Outcome: "not_found_create_po"}, nil
	case PONotFoundReject:
		return POResolution{Match: &notFoundMatch, Outcome: "not_found_reject"}, nil
	default: // WAIT_USER, SEARCH_ALTERNATIVE (manual pick via purchase-orders/search)
		return POResolution{Match: &notFoundMatch, Outcome: "not_found_wait"}, nil
	}
}

func findPOLine(orders []sap.PurchaseOrder, number, itemRef, level string) (*sap.PurchaseOrder, *sap.PurchaseOrderItem, bool) {
	for i := range orders {
		po := &orders[i]
		if number != "" && !strings.EqualFold(strings.TrimSpace(po.Number), strings.TrimSpace(number)) {
			continue
		}
		if level == POReferenceLevelDocument || itemRef == "" {
			return po, nil, true
		}
		for j := range po.Items {
			line := &po.Items[j]
			if sameSAPItem(line.ItemNumber, itemRef) {
				return po, line, true
			}
		}
		if level == POReferenceLevelDocumentOrItem {
			return po, nil, true
		}
	}
	return nil, nil, false
}

func strVal(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func sameSAPItem(a, b string) bool {
	na := strings.TrimLeft(strings.TrimSpace(a), "0")
	nb := strings.TrimLeft(strings.TrimSpace(b), "0")
	if na == "" {
		na = "0"
	}
	if nb == "" {
		nb = "0"
	}
	return strings.EqualFold(na, nb)
}

func lookupPOLineUnit(ctx context.Context, adapter sap.Adapter, vendorCNPJ, branchCNPJ, poNumber, poItem string) string {
	poNumber = strings.TrimSpace(poNumber)
	if adapter == nil || poNumber == "" {
		return ""
	}
	orders, err := adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
		VendorCNPJ:    vendorCNPJ,
		BranchCNPJ:    branchCNPJ,
		PurchaseOrder: poNumber,
	})
	if err != nil {
		return ""
	}
	po, line, found := findPOLine(orders, poNumber, poItem, POReferenceLevelDocumentOrItem)
	if !found {
		return ""
	}
	if line != nil {
		return strings.TrimSpace(line.Unit)
	}
	if po != nil && len(po.Items) == 1 {
		return strings.TrimSpace(po.Items[0].Unit)
	}
	return ""
}
