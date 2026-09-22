package organization

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// Material is an organization-level master-data row (Dados Mestres).
// Rows are created manually or upserted from inbound NF-e items.
type Material struct {
	ID                   uuid.UUID     `json:"id"`
	OrganizationID       uuid.UUID     `json:"organization_id"`
	MaterialCode         string        `json:"material_code"`
	SupplierMaterialCode *string       `json:"supplier_material_code,omitempty"`
	Description          *string       `json:"description,omitempty"`
	BaseUnit             *string       `json:"base_unit,omitempty"`
	NCM                  *string       `json:"ncm,omitempty"`
	Source               string        `json:"source"`
	LastSeenAt           *time.Time    `json:"last_seen_at,omitempty"`
	CreatedAt            time.Time     `json:"created_at"`
	UpdatedAt            time.Time     `json:"updated_at"`
	UOMs                 []MaterialUOM `json:"uoms,omitempty"`
}

// MaterialUOM is one alternative unit of measure: X alternative <=> Y base.
type MaterialUOM struct {
	ID                     uuid.UUID `json:"id"`
	OrganizationID         uuid.UUID `json:"organization_id"`
	OrganizationMaterialID uuid.UUID `json:"organization_material_id"`
	AlternativeUnit        string    `json:"alternative_unit"`
	BaseUnit               string    `json:"base_unit"`
	Numerator              float64   `json:"numerator"`
	Denominator            float64   `json:"denominator"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
}

type CreateMaterialInput struct {
	OrganizationID       uuid.UUID
	MaterialCode         string
	SupplierMaterialCode string
	Description          string
	BaseUnit             string
	NCM                  string
	ActorUserID          uuid.UUID
}

type UpdateMaterialInput struct {
	OrganizationID       uuid.UUID
	MaterialID           uuid.UUID
	Description          string
	BaseUnit             string
	NCM                  string
	SupplierMaterialCode string
	ActorUserID          uuid.UUID
}

type UpsertMaterialUOMInput struct {
	OrganizationID  uuid.UUID
	MaterialID      uuid.UUID
	UOMID           uuid.UUID
	AlternativeUnit string
	BaseUnit        string
	Numerator       float64
	Denominator     float64
	ActorUserID     uuid.UUID
}

func normalizeUnit(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

func normalizeMaterialCode(s string) string {
	return strings.TrimSpace(s)
}

const materialColumns = `
	id, organization_id, material_code, supplier_material_code, description,
	base_unit, ncm, source, last_seen_at, created_at, updated_at
`

func (s *Service) ListMaterials(ctx context.Context, organizationID uuid.UUID, query string) ([]Material, error) {
	q := strings.TrimSpace(strings.ToLower(query))
	rows, err := s.pool.Query(ctx, `
		select `+materialColumns+`
		from organization_materials
		where organization_id = $1
		  and (
		    $2 = ''
		    or lower(material_code) like '%' || $2 || '%'
		    or lower(coalesce(supplier_material_code, '')) like '%' || $2 || '%'
		    or lower(coalesce(description, '')) like '%' || $2 || '%'
		    or lower(coalesce(ncm, '')) like '%' || $2 || '%'
		  )
		order by material_code
		limit 500
	`, organizationID, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Material, 0)
	materialIDs := make([]uuid.UUID, 0)
	for rows.Next() {
		m, err := scanMaterial(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
		materialIDs = append(materialIDs, m.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	byMaterial, err := s.listUOMsForMaterials(ctx, organizationID, materialIDs)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].UOMs = byMaterial[out[i].ID]
	}
	return out, nil
}

func (s *Service) GetMaterial(ctx context.Context, organizationID, materialID uuid.UUID) (*Material, error) {
	row := s.pool.QueryRow(ctx, `
		select `+materialColumns+`
		from organization_materials
		where organization_id = $1 and id = $2
	`, organizationID, materialID)
	m, err := scanMaterial(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("material_not_found", "Material not found")
		}
		return nil, err
	}
	byMaterial, err := s.listUOMsForMaterials(ctx, organizationID, []uuid.UUID{m.ID})
	if err != nil {
		return nil, err
	}
	m.UOMs = byMaterial[m.ID]
	return &m, nil
}

func (s *Service) GetMaterialByCode(ctx context.Context, organizationID uuid.UUID, code string) (*Material, error) {
	code = normalizeMaterialCode(code)
	if code == "" {
		return nil, domainerr.NotFound("material_not_found", "Material not found")
	}
	stripped := strings.TrimLeft(code, "0")
	row := s.pool.QueryRow(ctx, `
		select `+materialColumns+`
		from organization_materials
		where organization_id = $1
		  and (
		    material_code = $2
		    or supplier_material_code = $2
		    or ($3 <> '' and ltrim(material_code, '0') = $3)
		    or ($3 <> '' and ltrim(coalesce(supplier_material_code, ''), '0') = $3)
		  )
		order by case when material_code = $2 then 0 else 1 end
		limit 1
	`, organizationID, code, stripped)
	m, err := scanMaterial(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("material_not_found", "Material not found")
		}
		return nil, err
	}
	byMaterial, err := s.listUOMsForMaterials(ctx, organizationID, []uuid.UUID{m.ID})
	if err != nil {
		return nil, err
	}
	m.UOMs = byMaterial[m.ID]
	return &m, nil
}

func (s *Service) listUOMsForMaterials(ctx context.Context, organizationID uuid.UUID, materialIDs []uuid.UUID) (map[uuid.UUID][]MaterialUOM, error) {
	out := map[uuid.UUID][]MaterialUOM{}
	if len(materialIDs) == 0 {
		return out, nil
	}
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_material_id, alternative_unit, base_unit,
		       numerator, denominator, created_at, updated_at
		from organization_material_uoms
		where organization_id = $1 and organization_material_id = any($2)
		order by alternative_unit
	`, organizationID, materialIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		u, err := scanMaterialUOM(rows)
		if err != nil {
			return nil, err
		}
		out[u.OrganizationMaterialID] = append(out[u.OrganizationMaterialID], u)
	}
	return out, rows.Err()
}

func (s *Service) CreateMaterial(ctx context.Context, in CreateMaterialInput) (*Material, error) {
	code := normalizeMaterialCode(in.MaterialCode)
	if code == "" {
		return nil, domainerr.Validation("invalid_material", "material_code is required")
	}
	base := normalizeUnit(in.BaseUnit)
	now := time.Now().UTC()
	mat := &Material{
		ID:                   ids.New(),
		OrganizationID:       in.OrganizationID,
		MaterialCode:         code,
		SupplierMaterialCode: optionalTrimmed(in.SupplierMaterialCode),
		Description:          optionalTrimmed(in.Description),
		BaseUnit:             optionalTrimmed(base),
		NCM:                  optionalTrimmed(strings.TrimSpace(in.NCM)),
		Source:               "manual",
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_materials (
				id, organization_id, material_code, supplier_material_code, description,
				base_unit, ncm, source, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,'manual',$8,$8)
		`, mat.ID, mat.OrganizationID, mat.MaterialCode, mat.SupplierMaterialCode, mat.Description,
			mat.BaseUnit, mat.NCM, now)
		if err != nil {
			return err
		}
		if base != "" {
			if err := insertMaterialUOM(ctx, tx, MaterialUOM{
				ID:                     ids.New(),
				OrganizationID:         in.OrganizationID,
				OrganizationMaterialID: mat.ID,
				AlternativeUnit:        base,
				BaseUnit:               base,
				Numerator:              1,
				Denominator:            1,
				CreatedAt:              now,
				UpdatedAt:              now,
			}); err != nil {
				return err
			}
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "material.create",
			ResourceType:   "organization_materials",
			ResourceID:     mat.ID.String(),
			After:          mat,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organization_materials_organization_id_material_code") ||
			strings.Contains(err.Error(), "unique") {
			return nil, domainerr.Conflict("material_already_exists", "Material with this code already exists")
		}
		return nil, err
	}
	return s.GetMaterial(ctx, in.OrganizationID, mat.ID)
}

func (s *Service) UpdateMaterial(ctx context.Context, in UpdateMaterialInput) (*Material, error) {
	base := normalizeUnit(in.BaseUnit)
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		now := time.Now().UTC()
		tag, err := tx.Exec(ctx, `
			update organization_materials set
				description = $3,
				base_unit = $4,
				ncm = $5,
				supplier_material_code = $6,
				updated_at = $7
			where organization_id = $1 and id = $2
		`, in.OrganizationID, in.MaterialID,
			optionalTrimmed(in.Description), optionalTrimmed(base),
			optionalTrimmed(strings.TrimSpace(in.NCM)), optionalTrimmed(in.SupplierMaterialCode), now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("material_not_found", "Material not found")
		}
		if base != "" {
			if _, err = tx.Exec(ctx, `
				update organization_material_uoms set base_unit = $3, updated_at = $4
				where organization_id = $1 and organization_material_id = $2
			`, in.OrganizationID, in.MaterialID, base, now); err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `
				insert into organization_material_uoms (
					id, organization_id, organization_material_id,
					alternative_unit, base_unit, numerator, denominator, created_at, updated_at
				) values ($1,$2,$3,$4,$4,1,1,$5,$5)
				on conflict (organization_material_id, alternative_unit) do nothing
			`, ids.New(), in.OrganizationID, in.MaterialID, base, now); err != nil {
				return err
			}
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "material.update",
			ResourceType:   "organization_materials",
			ResourceID:     in.MaterialID.String(),
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetMaterial(ctx, in.OrganizationID, in.MaterialID)
}

func (s *Service) CreateMaterialUOM(ctx context.Context, in UpsertMaterialUOMInput) (*MaterialUOM, error) {
	alt := normalizeUnit(in.AlternativeUnit)
	base := normalizeUnit(in.BaseUnit)
	if alt == "" {
		return nil, domainerr.Validation("invalid_uom", "alternative_unit is required")
	}
	if in.Numerator <= 0 || in.Denominator <= 0 {
		return nil, domainerr.Validation("invalid_uom_factor", "numerator and denominator must be greater than zero")
	}
	mat, err := s.GetMaterial(ctx, in.OrganizationID, in.MaterialID)
	if err != nil {
		return nil, err
	}
	if base == "" {
		if mat.BaseUnit != nil {
			base = *mat.BaseUnit
		}
	}
	if base == "" {
		return nil, domainerr.Validation("invalid_uom", "base_unit is required")
	}

	now := time.Now().UTC()
	uom := MaterialUOM{
		ID:                     ids.New(),
		OrganizationID:         in.OrganizationID,
		OrganizationMaterialID: in.MaterialID,
		AlternativeUnit:        alt,
		BaseUnit:               base,
		Numerator:              in.Numerator,
		Denominator:            in.Denominator,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if err := insertMaterialUOM(ctx, tx, uom); err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "material.uom.create",
			ResourceType:   "organization_material_uoms",
			ResourceID:     uom.ID.String(),
			After:          uom,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "organization_material_uoms") && strings.Contains(err.Error(), "unique") {
			return nil, domainerr.Conflict("uom_already_exists", "This alternative unit is already registered for the material")
		}
		return nil, err
	}
	return &uom, nil
}

func (s *Service) UpdateMaterialUOM(ctx context.Context, in UpsertMaterialUOMInput) (*MaterialUOM, error) {
	alt := normalizeUnit(in.AlternativeUnit)
	base := normalizeUnit(in.BaseUnit)
	if alt == "" {
		return nil, domainerr.Validation("invalid_uom", "alternative_unit is required")
	}
	if in.Numerator <= 0 || in.Denominator <= 0 {
		return nil, domainerr.Validation("invalid_uom_factor", "numerator and denominator must be greater than zero")
	}
	if base == "" {
		return nil, domainerr.Validation("invalid_uom", "base_unit is required")
	}
	var out MaterialUOM
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		now := time.Now().UTC()
		row := tx.QueryRow(ctx, `
			update organization_material_uoms set
				alternative_unit = $4, base_unit = $5, numerator = $6, denominator = $7, updated_at = $8
			where organization_id = $1 and organization_material_id = $2 and id = $3
			returning id, organization_id, organization_material_id, alternative_unit, base_unit,
			          numerator, denominator, created_at, updated_at
		`, in.OrganizationID, in.MaterialID, in.UOMID, alt, base, in.Numerator, in.Denominator, now)
		var err error
		out, err = scanMaterialUOM(row)
		if err != nil {
			if err == pgx.ErrNoRows {
				return domainerr.NotFound("uom_not_found", "Unit of measure not found")
			}
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "material.uom.update",
			ResourceType:   "organization_material_uoms",
			ResourceID:     in.UOMID.String(),
			After:          out,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			return nil, domainerr.Conflict("uom_already_exists", "This alternative unit is already registered for the material")
		}
		return nil, err
	}
	return &out, nil
}

func (s *Service) DeleteMaterialUOM(ctx context.Context, organizationID, materialID, uomID, actorUserID uuid.UUID) error {
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			delete from organization_material_uoms
			where organization_id = $1 and organization_material_id = $2 and id = $3
		`, organizationID, materialID, uomID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("uom_not_found", "Unit of measure not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "material.uom.delete",
			ResourceType:   "organization_material_uoms",
			ResourceID:     uomID.String(),
		})
	})
}

func insertMaterialUOM(ctx context.Context, tx pgx.Tx, uom MaterialUOM) error {
	_, err := tx.Exec(ctx, `
		insert into organization_material_uoms (
			id, organization_id, organization_material_id,
			alternative_unit, base_unit, numerator, denominator, created_at, updated_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
	`, uom.ID, uom.OrganizationID, uom.OrganizationMaterialID,
		uom.AlternativeUnit, uom.BaseUnit, uom.Numerator, uom.Denominator, uom.CreatedAt, uom.UpdatedAt)
	return err
}

type materialScanner interface {
	Scan(dest ...any) error
}

func scanMaterial(row materialScanner) (Material, error) {
	var m Material
	err := row.Scan(
		&m.ID, &m.OrganizationID, &m.MaterialCode, &m.SupplierMaterialCode, &m.Description,
		&m.BaseUnit, &m.NCM, &m.Source, &m.LastSeenAt, &m.CreatedAt, &m.UpdatedAt,
	)
	return m, err
}

func scanMaterialUOM(row materialScanner) (MaterialUOM, error) {
	var u MaterialUOM
	err := row.Scan(
		&u.ID, &u.OrganizationID, &u.OrganizationMaterialID, &u.AlternativeUnit, &u.BaseUnit,
		&u.Numerator, &u.Denominator, &u.CreatedAt, &u.UpdatedAt,
	)
	return u, err
}

// ConvertQuantity converts qty from fromUnit to toUnit using SAP-style
// alternative UOMs (X alternative <=> Y base). Units are compared case-insensitively.
func ConvertQuantity(qty float64, fromUnit, toUnit string, uoms []MaterialUOM, baseUnit string) (float64, error) {
	from := normalizeUnit(fromUnit)
	to := normalizeUnit(toUnit)
	base := normalizeUnit(baseUnit)
	if from == "" || to == "" {
		return 0, domainerr.Validation("invalid_uom", "from and to units are required")
	}
	if from == to {
		return qty, nil
	}
	qtyBase, err := quantityToBase(qty, from, uoms, base)
	if err != nil {
		return 0, err
	}
	return quantityFromBase(qtyBase, to, uoms, base)
}

func quantityToBase(qty float64, unit string, uoms []MaterialUOM, base string) (float64, error) {
	if unit == base {
		return qty, nil
	}
	uom, ok := findUOM(uoms, unit)
	if !ok {
		return 0, domainerr.Validation("uom_not_registered", "Unidade "+unit+" não cadastrada no material")
	}
	if uom.Numerator == 0 {
		return 0, domainerr.Validation("invalid_uom_factor", "numerator must be greater than zero")
	}
	// X alternative <=> Y base  →  qty_base = qty_alt * (Y / X)
	return qty * (uom.Denominator / uom.Numerator), nil
}

func quantityFromBase(qtyBase float64, unit string, uoms []MaterialUOM, base string) (float64, error) {
	if unit == base {
		return qtyBase, nil
	}
	uom, ok := findUOM(uoms, unit)
	if !ok {
		return 0, domainerr.Validation("uom_not_registered", "Unidade "+unit+" não cadastrada no material")
	}
	if uom.Denominator == 0 {
		return 0, domainerr.Validation("invalid_uom_factor", "denominator must be greater than zero")
	}
	// qty_alt = qty_base * (X / Y)
	return qtyBase * (uom.Numerator / uom.Denominator), nil
}

func findUOM(uoms []MaterialUOM, unit string) (MaterialUOM, bool) {
	for _, u := range uoms {
		if normalizeUnit(u.AlternativeUnit) == unit {
			return u, true
		}
	}
	return MaterialUOM{}, false
}
