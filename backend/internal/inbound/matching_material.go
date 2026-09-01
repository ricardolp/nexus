package inbound

import (
	"context"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

// matchMaterial runs the material matching strategies (spec §18) in order
// of trust: a prior MATERIAL override for this item, a learned De/Para
// mapping, SAP resolution, then the material on the matched PO line.
// Persists the outcome as an item-level match.
func matchMaterial(ctx context.Context, tx dbtx, adapter sap.Adapter, organizationID uuid.UUID, companyID *uuid.UUID, vendorCNPJ, branchCNPJ, vendorCode string, item Item) (Match, error) {
	supplierCode := ""
	if item.SupplierMaterialCode != nil {
		supplierCode = *item.SupplierMaterialCode
	}
	itemID := item.ID

	// Explicit operator decision must survive Reprocess.
	if resolved, ok, err := lookupLatestItemOverride(ctx, tx, organizationID, item.OrganizationDocumentID, itemID, OverrideTypeMaterial); err != nil {
		return Match{}, err
	} else if ok && resolved != "" {
		return insertMatch(ctx, tx, Match{
			OrganizationID:         organizationID,
			OrganizationDocumentID: item.OrganizationDocumentID,
			OrganizationNFeItemID:  &itemID,
			MatchType:              MatchTypeMaterial,
			SourceValue:            nullEmptyStr(supplierCode),
			ResolvedValue:          nullEmptyStr(resolved),
			Strategy:               nullEmptyStr("manual_override"),
			Confidence:             floatPtr(1),
			Status:                 MatchStatusManualMap,
		})
	}

	if resolved, ok, err := lookupVendorMaterialMapping(ctx, tx, organizationID, companyID, vendorCNPJ, supplierCode); err != nil {
		return Match{}, err
	} else if ok {
		return insertMatch(ctx, tx, Match{
			OrganizationID:         organizationID,
			OrganizationDocumentID: item.OrganizationDocumentID,
			OrganizationNFeItemID:  &itemID,
			MatchType:              MatchTypeMaterial,
			SourceValue:            nullEmptyStr(supplierCode),
			ResolvedValue:          nullEmptyStr(resolved),
			Strategy:               nullEmptyStr("vendor_material_mapping"),
			Confidence:             floatPtr(1),
			Status:                 MatchStatusManualMap,
		})
	}

	// TEMPORARY: same gap as ResolveVendor — /materials/resolve is not on the
	// real CPI tenant. On adapter failure, fall through to PO-line material.
	if supplierCode != "" {
		resolution, err := adapter.ResolveMaterial(ctx, vendorCode, supplierCode)
		if err == nil && resolution.Status == MatchStatusMatched {
			return insertMatch(ctx, tx, Match{
				OrganizationID:         organizationID,
				OrganizationDocumentID: item.OrganizationDocumentID,
				OrganizationNFeItemID:  &itemID,
				MatchType:              MatchTypeMaterial,
				SourceValue:            nullEmptyStr(supplierCode),
				ResolvedValue:          nullEmptyStr(resolution.MaterialCode),
				Strategy:               nullEmptyStr(defaultStr(resolution.Strategy, "sap_resolution")),
				Confidence:             floatPtr(0.9),
				Status:                 resolution.Status,
			})
		}
	}

	if item.ResolvedPurchaseOrderNumber != nil && item.ResolvedPurchaseOrderItem != nil {
		orders, err := adapter.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{
			VendorCNPJ:    vendorCNPJ,
			BranchCNPJ:    branchCNPJ,
			PurchaseOrder: *item.ResolvedPurchaseOrderNumber,
		})
		if err != nil {
			return Match{}, wrapAdapterErr(err)
		}
		for _, po := range orders {
			for _, line := range po.Items {
				if line.ItemNumber == *item.ResolvedPurchaseOrderItem {
					return insertMatch(ctx, tx, Match{
						OrganizationID:         organizationID,
						OrganizationDocumentID: item.OrganizationDocumentID,
						OrganizationNFeItemID:  &itemID,
						MatchType:              MatchTypeMaterial,
						SourceValue:            nullEmptyStr(supplierCode),
						ResolvedValue:          nullEmptyStr(line.MaterialCode),
						Strategy:               nullEmptyStr("purchase_order_line"),
						Confidence:             floatPtr(0.7),
						Status:                 MatchStatusMatched,
					})
				}
			}
		}
	}

	return insertMatch(ctx, tx, Match{
		OrganizationID:         organizationID,
		OrganizationDocumentID: item.OrganizationDocumentID,
		OrganizationNFeItemID:  &itemID,
		MatchType:              MatchTypeMaterial,
		SourceValue:            nullEmptyStr(supplierCode),
		Status:                 MatchStatusNotFound,
	})
}

func floatPtr(v float64) *float64 { return &v }
