package inbound

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type ApplyOverrideInput struct {
	OrganizationID        uuid.UUID
	DocumentID            uuid.UUID
	ItemID                *uuid.UUID // nil = document-level override (VENDOR)
	OverrideType          string     // VENDOR | MATERIAL | PURCHASE_ORDER | PURCHASE_ORDER_ITEM | QUANTITY | PRICE
	OverrideValue         string
	PurchaseOrderItem     string // optional companion for OverrideType=PURCHASE_ORDER
	Reason                string
	SaveAsMapping         bool
	OrganizationCompanyID *uuid.UUID // required when SaveAsMapping and OverrideType=MATERIAL
	VendorCNPJ            string     // required when SaveAsMapping and OverrideType=MATERIAL
	ActorUserID           uuid.UUID
}

var allowedOverrideTypes = set(OverrideTypeVendor, OverrideTypeMaterial, OverrideTypePurchaseOrder, OverrideTypePurchaseOrderItem, OverrideTypeQuantity, OverrideTypePrice)

// ApplyOverride records a manual decision on top of matching (spec §5.3/§53)
// — it never edits the original extracted data (see PatchItem for that),
// only what the platform will use going forward. When overriding a
// material and SaveAsMapping is set, the decision is also persisted as a
// reusable De/Para entry (spec §20 "Criar de/para").
func (s *Service) ApplyOverride(ctx context.Context, in ApplyOverrideInput) (*Override, error) {
	if _, ok := allowedOverrideTypes[in.OverrideType]; !ok {
		return nil, domainerr.Validation("invalid_override_type", "unsupported override_type: "+in.OverrideType)
	}
	value := strings.TrimSpace(in.OverrideValue)
	reason := strings.TrimSpace(in.Reason)
	if value == "" || reason == "" {
		return nil, domainerr.Validation("invalid_override", "override_value and reason are required")
	}
	if in.OverrideType != OverrideTypeVendor && in.ItemID == nil {
		return nil, domainerr.Validation("invalid_override", "item_id is required for this override_type")
	}

	var override Override
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		var item *Item
		var originalValue *string
		if in.ItemID != nil {
			it, err := getItem(ctx, tx, in.OrganizationID, *in.ItemID)
			if err != nil {
				return err
			}
			item = &it
			originalValue = overrideOriginalValue(in.OverrideType, it)
		}

		override = Override{
			OrganizationID:         in.OrganizationID,
			OrganizationDocumentID: in.DocumentID,
			OrganizationNFeItemID:  in.ItemID,
			OverrideType:           in.OverrideType,
			OriginalValue:          originalValue,
			OverrideValue:          value,
			Reason:                 reason,
			CreatedByUserID:        in.ActorUserID,
		}
		saved, err := insertOverride(ctx, tx, override)
		if err != nil {
			return err
		}
		override = saved

		matchType := ""
		switch in.OverrideType {
		case OverrideTypeVendor:
			matchType = MatchTypeVendor
		case OverrideTypeMaterial:
			matchType = MatchTypeMaterial
		case OverrideTypePurchaseOrder, OverrideTypePurchaseOrderItem:
			matchType = MatchTypePurchaseOrder
		}
		if matchType != "" {
			if _, err := insertMatch(ctx, tx, Match{
				OrganizationID: in.OrganizationID, OrganizationDocumentID: in.DocumentID, OrganizationNFeItemID: in.ItemID,
				MatchType: matchType, SourceValue: originalValue, ResolvedValue: &value,
				Strategy: nullEmptyStr("manual_override"), Confidence: floatPtr(1), Status: MatchStatusManualMap,
			}); err != nil {
				return err
			}
		}

		if item != nil {
			if err := applyOverrideToItem(ctx, tx, *item, in.OverrideType, value, in.PurchaseOrderItem); err != nil {
				return err
			}
		}

		// Persist the companion PO item as its own override so Reprocess can
		// restore both number and item after resolved_* fields are cleared.
		if in.OverrideType == OverrideTypePurchaseOrder && strings.TrimSpace(in.PurchaseOrderItem) != "" && item != nil {
			poItemOverride := Override{
				OrganizationID:         in.OrganizationID,
				OrganizationDocumentID: in.DocumentID,
				OrganizationNFeItemID:  in.ItemID,
				OverrideType:           OverrideTypePurchaseOrderItem,
				OriginalValue:          item.ResolvedPurchaseOrderItem,
				OverrideValue:          strings.TrimSpace(in.PurchaseOrderItem),
				Reason:                 reason,
				CreatedByUserID:        in.ActorUserID,
			}
			if _, err := insertOverride(ctx, tx, poItemOverride); err != nil {
				return err
			}
		}

		if in.OverrideType == OverrideTypeMaterial && in.SaveAsMapping && item != nil {
			supplierCode := strVal(item.SupplierMaterialCode)
			vendorCNPJ := strings.TrimSpace(in.VendorCNPJ)
			if supplierCode != "" && vendorCNPJ != "" {
				if _, err := s.UpsertVendorMaterialMapping(ctx, CreateVendorMaterialMappingInput{
					OrganizationID:        in.OrganizationID,
					OrganizationCompanyID: in.OrganizationCompanyID,
					VendorCNPJ:            vendorCNPJ,
					SupplierMaterialCode:  supplierCode,
					ResolvedMaterialCode:  value,
					ActorUserID:           in.ActorUserID,
				}); err != nil {
					return err
				}
			}
		}

		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound.override.apply",
			ResourceType:   "organization_document_overrides",
			ResourceID:     override.ID.String(),
			After:          override,
		})
	})
	if err != nil {
		return nil, err
	}
	return &override, nil
}

// lookupLatestItemOverride returns the most recent override for an item+type
// (used by rematching so Reprocess does not wipe an explicit operator decision).
func lookupLatestItemOverride(ctx context.Context, tx dbtx, organizationID, documentID, itemID uuid.UUID, overrideType string) (string, bool, error) {
	var value string
	err := tx.QueryRow(ctx, `
		select override_value
		from organization_document_overrides
		where organization_id = $1
		  and organization_document_id = $2
		  and organization_nfe_item_id = $3
		  and override_type = $4
		order by created_at desc
		limit 1
	`, organizationID, documentID, itemID, overrideType).Scan(&value)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return strings.TrimSpace(value), true, nil
}

func overrideOriginalValue(overrideType string, item Item) *string {
	switch overrideType {
	case OverrideTypeMaterial:
		return item.ResolvedMaterialCode
	case OverrideTypePurchaseOrder:
		return item.ResolvedPurchaseOrderNumber
	case OverrideTypePurchaseOrderItem:
		return item.ResolvedPurchaseOrderItem
	case OverrideTypeQuantity:
		v := formatFloat(item.Quantity)
		return &v
	case OverrideTypePrice:
		v := formatFloat(item.UnitPrice)
		return &v
	default:
		return nil
	}
}

func applyOverrideToItem(ctx context.Context, tx dbtx, item Item, overrideType, value, poItem string) error {
	switch overrideType {
	case OverrideTypeMaterial:
		item.ResolvedMaterialCode = &value
		item.Status = ItemStatusMatched
	case OverrideTypePurchaseOrder:
		item.ResolvedPurchaseOrderNumber = &value
		if poItem != "" {
			item.ResolvedPurchaseOrderItem = &poItem
		}
		item.Status = ItemStatusMatched
	case OverrideTypePurchaseOrderItem:
		item.ResolvedPurchaseOrderItem = &value
		item.Status = ItemStatusMatched
	case OverrideTypeQuantity:
		qty, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return domainerr.Validation("invalid_override", "override_value must be numeric for QUANTITY")
		}
		item.Quantity = qty
	case OverrideTypePrice:
		price, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return domainerr.Validation("invalid_override", "override_value must be numeric for PRICE")
		}
		item.UnitPrice = price
	default:
		return nil // VENDOR: document-level, nothing to update on the item
	}
	item.UpdatedAt = time.Now().UTC()
	return updateItemFields(ctx, tx, item)
}
