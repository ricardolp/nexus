package inbound

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// dbtx is satisfied by both pgx.Tx and *db.Pool — every insert/select helper
// below accepts it so callers can run either inside a transaction during
// orchestration, or directly against the pool for read-only queries.
type dbtx interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func insertItems(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID, extracted []ExtractedItem) ([]Item, error) {
	now := time.Now().UTC()
	items := make([]Item, 0, len(extracted))
	for _, e := range extracted {
		item := Item{
			ID:                            ids.New(),
			OrganizationID:                organizationID,
			OrganizationDocumentID:        documentID,
			ItemNumber:                    e.ItemNumber,
			SupplierMaterialCode:          nullEmptyStr(e.SupplierMaterialCode),
			Description:                   nullEmptyStr(e.Description),
			NCM:                           nullEmptyStr(e.NCM),
			CFOP:                          nullEmptyStr(e.CFOP),
			Quantity:                      e.Quantity,
			Unit:                          nullEmptyStr(e.Unit),
			UnitPrice:                     e.UnitPrice,
			TotalAmount:                   e.TotalAmount,
			PurchaseOrderReferenceRaw:     nullEmptyStr(e.PurchaseOrderReferenceRaw),
			PurchaseOrderItemReferenceRaw: nullEmptyStr(e.PurchaseOrderItemReferenceRaw),
			Status:                        ItemStatusPending,
			CreatedAt:                     now,
			UpdatedAt:                     now,
		}
		if !e.Taxes.Empty() {
			taxes := e.Taxes
			item.Taxes = &taxes
		}
		_, err := tx.Exec(ctx, `
			insert into organization_nfe_items (
				id, organization_id, organization_document_id, item_number, supplier_material_code, description,
				ncm, cfop, quantity, unit, unit_price, total_amount,
				purchase_order_reference_raw, purchase_order_item_reference_raw, taxes_json, status, created_at, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		`, item.ID, item.OrganizationID, item.OrganizationDocumentID, item.ItemNumber, item.SupplierMaterialCode, item.Description,
			item.NCM, item.CFOP, item.Quantity, item.Unit, item.UnitPrice, item.TotalAmount,
			item.PurchaseOrderReferenceRaw, item.PurchaseOrderItemReferenceRaw, taxesJSON(item.Taxes), item.Status, now, now)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

const itemColumns = `
	id, organization_id, organization_document_id, item_number, supplier_material_code, description,
	ncm, cfop, quantity, unit, unit_price, total_amount,
	purchase_order_reference_raw, purchase_order_item_reference_raw, taxes_json,
	resolved_material_code, resolved_purchase_order_number, resolved_purchase_order_item,
	status, created_at, updated_at
`

func scanItem(row rowScanner) (Item, error) {
	var it Item
	var taxesRaw []byte
	err := row.Scan(
		&it.ID, &it.OrganizationID, &it.OrganizationDocumentID, &it.ItemNumber, &it.SupplierMaterialCode, &it.Description,
		&it.NCM, &it.CFOP, &it.Quantity, &it.Unit, &it.UnitPrice, &it.TotalAmount,
		&it.PurchaseOrderReferenceRaw, &it.PurchaseOrderItemReferenceRaw, &taxesRaw,
		&it.ResolvedMaterialCode, &it.ResolvedPurchaseOrderNumber, &it.ResolvedPurchaseOrderItem,
		&it.Status, &it.CreatedAt, &it.UpdatedAt,
	)
	if err != nil {
		return it, err
	}
	it.Taxes = parseTaxesJSON(taxesRaw)
	return it, nil
}

func taxesJSON(t *ItemTaxes) []byte {
	if t.Empty() {
		return []byte(`{}`)
	}
	b, err := json.Marshal(t)
	if err != nil {
		return []byte(`{}`)
	}
	return b
}

func parseTaxesJSON(raw []byte) *ItemTaxes {
	if len(raw) == 0 || string(raw) == "{}" || string(raw) == "null" {
		return nil
	}
	var t ItemTaxes
	if err := json.Unmarshal(raw, &t); err != nil || t.Empty() {
		return nil
	}
	return &t
}

func listItems(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) ([]Item, error) {
	rows, err := tx.Query(ctx, `select `+itemColumns+` from organization_nfe_items where organization_id = $1 and organization_document_id = $2 order by item_number`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []Item
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, nil
}

func getItem(ctx context.Context, tx dbtx, organizationID, itemID uuid.UUID) (Item, error) {
	row := tx.QueryRow(ctx, `select `+itemColumns+` from organization_nfe_items where organization_id = $1 and id = $2`, organizationID, itemID)
	it, err := scanItem(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Item{}, domainerr.NotFound("item_not_found", "Item not found")
		}
		return Item{}, err
	}
	return it, nil
}

// updateItemFields applies a partial correction to the raw extracted data
// (spec §5.1 "original" view) — used both for user-driven PATCH corrections
// and for recording a matching outcome (resolved_*/status).
func updateItemFields(ctx context.Context, tx dbtx, item Item) error {
	_, err := tx.Exec(ctx, `
		update organization_nfe_items set
			supplier_material_code = $3, description = $4, ncm = $5, cfop = $6, quantity = $7, unit = $8,
			unit_price = $9, total_amount = $10, purchase_order_reference_raw = $11, purchase_order_item_reference_raw = $12,
			resolved_material_code = $13, resolved_purchase_order_number = $14, resolved_purchase_order_item = $15,
			status = $16, updated_at = $17
		where organization_id = $1 and id = $2
	`, item.OrganizationID, item.ID, item.SupplierMaterialCode, item.Description, item.NCM, item.CFOP, item.Quantity, item.Unit,
		item.UnitPrice, item.TotalAmount, item.PurchaseOrderReferenceRaw, item.PurchaseOrderItemReferenceRaw,
		item.ResolvedMaterialCode, item.ResolvedPurchaseOrderNumber, item.ResolvedPurchaseOrderItem,
		item.Status, time.Now().UTC())
	return err
}

// resetDocumentMatchingState clears prior matches/validations and resolved_*
// fields so a re-run of processDocument produces a single current outcome
// instead of stacking historical NOT_FOUND rows in the UI.
func resetDocumentMatchingState(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) error {
	if _, err := tx.Exec(ctx, `
		delete from organization_document_validations
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		delete from organization_document_matches
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `
		update organization_nfe_items set
			resolved_material_code = null,
			resolved_purchase_order_number = null,
			resolved_purchase_order_item = null,
			status = $3,
			updated_at = $4
		where organization_id = $1 and organization_document_id = $2
	`, organizationID, documentID, ItemStatusPending, time.Now().UTC())
	return err
}

func insertMatch(ctx context.Context, tx dbtx, m Match) (Match, error) {
	if m.ID == uuid.Nil {
		m.ID = ids.New()
	}
	if m.CreatedAt.IsZero() {
		m.CreatedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
		insert into organization_document_matches (
			id, organization_id, organization_document_id, organization_nfe_item_id,
			match_type, source_value, resolved_value, strategy, confidence, status, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, m.ID, m.OrganizationID, m.OrganizationDocumentID, m.OrganizationNFeItemID,
		m.MatchType, m.SourceValue, m.ResolvedValue, m.Strategy, m.Confidence, m.Status, m.CreatedAt)
	return m, err
}

const matchColumns = `
	id, organization_id, organization_document_id, organization_nfe_item_id,
	match_type, source_value, resolved_value, strategy, confidence, status, created_at
`

func listMatches(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) ([]Match, error) {
	rows, err := tx.Query(ctx, `select `+matchColumns+` from organization_document_matches where organization_id = $1 and organization_document_id = $2 order by created_at`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Match
	for rows.Next() {
		var m Match
		if err := rows.Scan(&m.ID, &m.OrganizationID, &m.OrganizationDocumentID, &m.OrganizationNFeItemID,
			&m.MatchType, &m.SourceValue, &m.ResolvedValue, &m.Strategy, &m.Confidence, &m.Status, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, nil
}

func insertValidation(ctx context.Context, tx dbtx, v Validation) (Validation, error) {
	if v.ID == uuid.Nil {
		v.ID = ids.New()
	}
	if v.CreatedAt.IsZero() {
		v.CreatedAt = time.Now().UTC()
	}
	if v.Severity == "" {
		v.Severity = "info"
	}
	_, err := tx.Exec(ctx, `
		insert into organization_document_validations (
			id, organization_id, organization_document_id, organization_nfe_item_id,
			validation_type, status, severity, expected_value, actual_value, message,
			organization_inbound_scenario_id, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
	`, v.ID, v.OrganizationID, v.OrganizationDocumentID, v.OrganizationNFeItemID,
		v.ValidationType, v.Status, v.Severity, v.ExpectedValue, v.ActualValue, v.Message,
		v.OrganizationScenarioRuleID, v.CreatedAt)
	return v, err
}

const validationColumns = `
	id, organization_id, organization_document_id, organization_nfe_item_id,
	validation_type, status, severity, expected_value, actual_value, message,
	organization_inbound_scenario_id, created_at
`

func listValidations(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) ([]Validation, error) {
	rows, err := tx.Query(ctx, `select `+validationColumns+` from organization_document_validations where organization_id = $1 and organization_document_id = $2 order by created_at`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Validation
	for rows.Next() {
		var v Validation
		if err := rows.Scan(&v.ID, &v.OrganizationID, &v.OrganizationDocumentID, &v.OrganizationNFeItemID,
			&v.ValidationType, &v.Status, &v.Severity, &v.ExpectedValue, &v.ActualValue, &v.Message,
			&v.OrganizationScenarioRuleID, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

func insertOverride(ctx context.Context, tx dbtx, o Override) (Override, error) {
	if o.ID == uuid.Nil {
		o.ID = ids.New()
	}
	if o.CreatedAt.IsZero() {
		o.CreatedAt = time.Now().UTC()
	}
	_, err := tx.Exec(ctx, `
		insert into organization_document_overrides (
			id, organization_id, organization_document_id, organization_nfe_item_id,
			override_type, original_value, override_value, reason, created_by_user_id, approved_by_user_id, created_at
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, o.ID, o.OrganizationID, o.OrganizationDocumentID, o.OrganizationNFeItemID,
		o.OverrideType, o.OriginalValue, o.OverrideValue, o.Reason, o.CreatedByUserID, o.ApprovedByUserID, o.CreatedAt)
	return o, err
}

const overrideColumns = `
	id, organization_id, organization_document_id, organization_nfe_item_id,
	override_type, original_value, override_value, reason, created_by_user_id, approved_by_user_id, created_at
`

func listOverrides(ctx context.Context, tx dbtx, organizationID, documentID uuid.UUID) ([]Override, error) {
	rows, err := tx.Query(ctx, `select `+overrideColumns+` from organization_document_overrides where organization_id = $1 and organization_document_id = $2 order by created_at`, organizationID, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Override
	for rows.Next() {
		var o Override
		if err := rows.Scan(&o.ID, &o.OrganizationID, &o.OrganizationDocumentID, &o.OrganizationNFeItemID,
			&o.OverrideType, &o.OriginalValue, &o.OverrideValue, &o.Reason, &o.CreatedByUserID, &o.ApprovedByUserID, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, nil
}
