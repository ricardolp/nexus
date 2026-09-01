package inbound

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

type CreateVendorMaterialMappingInput struct {
	OrganizationID        uuid.UUID
	OrganizationCompanyID *uuid.UUID
	VendorCNPJ            string
	SupplierMaterialCode  string
	ResolvedMaterialCode  string
	ActorUserID           uuid.UUID
}

// UpsertVendorMaterialMapping creates or replaces the reusable De/Para entry
// (spec §19) for a vendor+supplier_material_code — used both by the
// dedicated CRUD endpoint and by ApplyOverride's save_as_mapping option.
func (s *Service) UpsertVendorMaterialMapping(ctx context.Context, in CreateVendorMaterialMappingInput) (*VendorMaterialMapping, error) {
	vendorCNPJ := strings.TrimSpace(in.VendorCNPJ)
	supplierCode := strings.TrimSpace(in.SupplierMaterialCode)
	resolvedCode := strings.TrimSpace(in.ResolvedMaterialCode)
	if vendorCNPJ == "" || supplierCode == "" || resolvedCode == "" {
		return nil, domainerr.Validation("invalid_mapping", "vendor_cnpj, supplier_material_code and resolved_material_code are required")
	}

	now := time.Now().UTC()
	m := &VendorMaterialMapping{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		OrganizationCompanyID: in.OrganizationCompanyID,
		VendorCNPJ:            vendorCNPJ,
		SupplierMaterialCode:  supplierCode,
		ResolvedMaterialCode:  resolvedCode,
		CreatedByUserID:       &in.ActorUserID,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	_, err := s.pool.Exec(ctx, `
		insert into organization_vendor_material_mappings (
			id, organization_id, organization_company_id, vendor_cnpj, supplier_material_code,
			resolved_material_code, created_by_user_id, created_at, updated_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		on conflict (organization_id, organization_company_id, vendor_cnpj, supplier_material_code)
		do update set resolved_material_code = excluded.resolved_material_code, updated_at = excluded.updated_at
	`, m.ID, m.OrganizationID, m.OrganizationCompanyID, m.VendorCNPJ, m.SupplierMaterialCode,
		m.ResolvedMaterialCode, m.CreatedByUserID, now, now)
	if err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Service) ListVendorMaterialMappings(ctx context.Context, organizationID uuid.UUID) ([]VendorMaterialMapping, error) {
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id, vendor_cnpj, supplier_material_code,
		       resolved_material_code, created_by_user_id, created_at, updated_at
		from organization_vendor_material_mappings
		where organization_id = $1
		order by created_at desc
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []VendorMaterialMapping
	for rows.Next() {
		var m VendorMaterialMapping
		if err := rows.Scan(&m.ID, &m.OrganizationID, &m.OrganizationCompanyID, &m.VendorCNPJ, &m.SupplierMaterialCode,
			&m.ResolvedMaterialCode, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

// lookupVendorMaterialMapping prefers a company-specific mapping, falling
// back to an organization-wide one (organization_company_id is null) —
// same fallback shape as integration.Service.ResolveActive.
func lookupVendorMaterialMapping(ctx context.Context, tx dbtx, organizationID uuid.UUID, companyID *uuid.UUID, vendorCNPJ, supplierMaterialCode string) (string, bool, error) {
	if companyID != nil {
		code, ok, err := queryMappingCode(ctx, tx, `
			select resolved_material_code from organization_vendor_material_mappings
			where organization_id = $1 and organization_company_id = $2 and vendor_cnpj = $3 and supplier_material_code = $4
		`, organizationID, *companyID, vendorCNPJ, supplierMaterialCode)
		if err != nil {
			return "", false, err
		}
		if ok {
			return code, true, nil
		}
	}
	return queryMappingCode(ctx, tx, `
		select resolved_material_code from organization_vendor_material_mappings
		where organization_id = $1 and organization_company_id is null and vendor_cnpj = $2 and supplier_material_code = $3
	`, organizationID, vendorCNPJ, supplierMaterialCode)
}

func queryMappingCode(ctx context.Context, tx dbtx, query string, args ...any) (string, bool, error) {
	var code string
	err := tx.QueryRow(ctx, query, args...).Scan(&code)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return code, true, nil
}
