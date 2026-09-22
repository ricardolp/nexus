package inbound

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
	"github.com/nexus/fiscal-messaging/internal/organization"
)

// NF commercial units that SAP typically stores as EA on the PO/material.
var nfPieceToSAP = map[string]string{
	"PC":  "EA",
	"PCE": "EA",
	"PÇ":  "EA",
	"UN":  "EA",
}

func sapPostingUnit(poUnit, xmlUnit string) string {
	if u := strings.ToUpper(strings.TrimSpace(poUnit)); u != "" {
		return u
	}
	xml := strings.ToUpper(strings.TrimSpace(xmlUnit))
	if mapped, ok := nfPieceToSAP[xml]; ok {
		return mapped
	}
	return xml
}

func convertQtyToUnit(qty float64, fromUnit, toUnit string, mat *organization.Material) float64 {
	if mat == nil || fromUnit == "" || toUnit == "" || strings.EqualFold(fromUnit, toUnit) {
		return qty
	}
	base := ""
	if mat.BaseUnit != nil {
		base = *mat.BaseUnit
	}
	converted, err := organization.ConvertQuantity(qty, fromUnit, toUnit, mat.UOMs, base)
	if err != nil {
		return qty
	}
	return converted
}

func applySAPPostingUnits(refs []sap.OrderRef, mats map[string]*organization.Material) {
	for i := range refs {
		xmlUnit := refs[i].Unit
		target := sapPostingUnit(refs[i].POUnit, xmlUnit)
		if target == "" {
			continue
		}
		mat := mats[strings.TrimLeft(strings.TrimSpace(refs[i].MaterialCode), "0")]
		if mat == nil {
			mat = mats[strings.TrimSpace(refs[i].MaterialCode)]
		}
		refs[i].Quantity = convertQtyToUnit(refs[i].Quantity, xmlUnit, target, mat)
		refs[i].POUnit = target
	}
}

func (s *Service) prepareSAPOrderRefs(ctx context.Context, tx pgx.Tx, organizationID uuid.UUID, adapter sap.Adapter, header nfeHeader, items []Item) []sap.OrderRef {
	refs := orderRefsFor(items)
	enrichOrderRefsPOUnit(ctx, adapter, header, refs)
	mats := map[string]*organization.Material{}
	if s != nil && s.orgs != nil {
		for _, ref := range refs {
			code := strings.TrimSpace(ref.MaterialCode)
			if code == "" {
				continue
			}
			if mat, err := s.orgs.GetMaterialByCode(ctx, organizationID, code); err == nil && mat != nil {
				mats[code] = mat
				if stripped := strings.TrimLeft(code, "0"); stripped != "" {
					mats[stripped] = mat
				}
			}
		}
	}
	applySAPPostingUnits(refs, mats)
	persistResolvedPOUnits(ctx, tx, items, refs)
	return refs
}

func persistResolvedPOUnits(ctx context.Context, tx pgx.Tx, items []Item, refs []sap.OrderRef) {
	if tx == nil || len(items) == 0 || len(refs) == 0 {
		return
	}
	byNF := map[int]string{}
	for _, ref := range refs {
		if u := strings.TrimSpace(ref.POUnit); u != "" {
			byNF[ref.NFItem] = u
		}
	}
	for _, it := range items {
		u := byNF[it.ItemNumber]
		if u == "" || strings.EqualFold(strVal(it.ResolvedPurchaseOrderUnit), u) {
			continue
		}
		it.ResolvedPurchaseOrderUnit = nullEmptyStr(u)
		_ = updateItemFields(ctx, tx, it)
	}
}
