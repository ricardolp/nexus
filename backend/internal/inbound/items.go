package inbound

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/organization"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

type PatchItemInput struct {
	OrganizationID                uuid.UUID
	DocumentID                    uuid.UUID
	ItemID                        uuid.UUID
	SupplierMaterialCode          *string
	Description                   *string
	NCM                           *string
	CFOP                          *string
	Quantity                      *float64
	Unit                          *string
	UnitPrice                     *float64
	PurchaseOrderReferenceRaw     *string
	PurchaseOrderItemReferenceRaw *string
	ActorUserID                   uuid.UUID
}

// PatchItem corrects the raw extracted data of an item — the fix for "XML
// vazio ou errado" (spec §5.1): it never touches resolved_*/matches, only
// the original view, and resets Status to PENDING so the next advance/retry
// re-attempts matching with the corrected data instead of reusing a stale
// NEEDS_CORRECTION outcome.
func (s *Service) PatchItem(ctx context.Context, in PatchItemInput) (*Item, error) {
	var result Item
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		item, err := getItem(ctx, tx, in.OrganizationID, in.ItemID)
		if err != nil {
			return err
		}
		before := item

		if in.SupplierMaterialCode != nil {
			item.SupplierMaterialCode = nullEmptyStr(*in.SupplierMaterialCode)
		}
		if in.Description != nil {
			item.Description = nullEmptyStr(*in.Description)
		}
		if in.NCM != nil {
			item.NCM = nullEmptyStr(*in.NCM)
		}
		if in.CFOP != nil {
			item.CFOP = nullEmptyStr(*in.CFOP)
		}
		if in.Quantity != nil {
			item.Quantity = *in.Quantity
		}
		if in.Unit != nil {
			item.Unit = nullEmptyStr(*in.Unit)
		}
		if in.UnitPrice != nil {
			item.UnitPrice = *in.UnitPrice
		}
		if in.PurchaseOrderReferenceRaw != nil {
			item.PurchaseOrderReferenceRaw = nullEmptyStr(*in.PurchaseOrderReferenceRaw)
		}
		if in.PurchaseOrderItemReferenceRaw != nil {
			item.PurchaseOrderItemReferenceRaw = nullEmptyStr(*in.PurchaseOrderItemReferenceRaw)
		}
		item.Status = ItemStatusPending
		item.UpdatedAt = time.Now().UTC()

		if err := updateItemFields(ctx, tx, item); err != nil {
			return err
		}
		result = item
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound.item.correct",
			ResourceType:   "organization_nfe_items",
			ResourceID:     in.ItemID.String(),
			Before:         before,
			After:          item,
		})
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (s *Service) ListItems(ctx context.Context, organizationID, documentID uuid.UUID) ([]Item, error) {
	return listItems(ctx, s.pool, organizationID, documentID)
}

func (s *Service) GetItem(ctx context.Context, organizationID, itemID uuid.UUID) (*Item, error) {
	item, err := getItem(ctx, s.pool, organizationID, itemID)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

type SetItemAlternativeUnitInput struct {
	OrganizationID uuid.UUID
	DocumentID     uuid.UUID
	ItemID         uuid.UUID
	Unit           string
	ActorUserID    uuid.UUID
}

// SetItemAlternativeUnit stores the UOM that should be posted to SAP instead
// of the XML commercial unit, converting quantity via the material master.
func (s *Service) SetItemAlternativeUnit(ctx context.Context, in SetItemAlternativeUnitInput) (*Item, error) {
	var result Item
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		item, err := getItem(ctx, tx, in.OrganizationID, in.ItemID)
		if err != nil {
			return err
		}
		if item.OrganizationDocumentID != in.DocumentID {
			return domainerr.NotFound("item_not_found", "Item not found")
		}
		before := item
		unit := strings.ToUpper(strings.TrimSpace(in.Unit))
		xmlUnit := ""
		if item.Unit != nil {
			xmlUnit = *item.Unit
		}

		if unit == "" || strings.EqualFold(unit, xmlUnit) {
			item.AlternativeUnit = nil
			item.AlternativeQuantity = nil
		} else {
			code := ""
			if item.ResolvedMaterialCode != nil && strings.TrimSpace(*item.ResolvedMaterialCode) != "" {
				code = strings.TrimSpace(*item.ResolvedMaterialCode)
			} else if item.SupplierMaterialCode != nil {
				code = strings.TrimSpace(*item.SupplierMaterialCode)
			}
			if code == "" {
				return domainerr.Validation("material_required", "Item has no material code to resolve alternative units")
			}
			mat, err := s.orgs.GetMaterialByCode(ctx, in.OrganizationID, code)
			if err != nil {
				return err
			}
			base := ""
			if mat.BaseUnit != nil {
				base = *mat.BaseUnit
			}
			qty, err := organization.ConvertQuantity(item.Quantity, xmlUnit, unit, mat.UOMs, base)
			if err != nil {
				return err
			}
			item.AlternativeUnit = nullEmptyStr(unit)
			item.AlternativeQuantity = &qty
		}
		item.UpdatedAt = time.Now().UTC()
		if err := updateItemAlternativeUnit(ctx, tx, item); err != nil {
			return err
		}
		result = item
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "inbound.item.alternative_unit",
			ResourceType:   "organization_nfe_items",
			ResourceID:     in.ItemID.String(),
			Before:         before,
			After:          item,
		})
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}
