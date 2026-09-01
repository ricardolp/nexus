package inbound

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) enrichNFeFromPayload(ctx context.Context, organizationID, documentID uuid.UUID, payload []byte, contentType string) error {
	header, err := ExtractNFeHeader(payload, contentType)
	if err != nil {
		return err
	}
	extracted, err := ExtractItems(payload, contentType)
	if err != nil {
		return err
	}
	if header != nil {
		if err := s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
			return persistNFeDetails(ctx, tx, documentID, header)
		}); err != nil {
			return err
		}
	}
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		return persistItemTaxes(ctx, tx, organizationID, documentID, extracted)
	})
}

func persistNFeDetails(ctx context.Context, tx pgx.Tx, documentID uuid.UUID, header *NFeHeader) error {
	if header.Details.Empty() && header.IssuedAt == nil {
		return nil
	}
	meta, err := json.Marshal(header.Details)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update organization_nfe
		set issued_at = coalesce($2, issued_at),
		    metadata_json = case
		        when coalesce(metadata_json, '{}'::jsonb) = '{}'::jsonb then $3::jsonb
		        else metadata_json || $3::jsonb
		    end
		where organization_document_id = $1
	`, documentID, header.IssuedAt, meta)
	return err
}

func persistItemTaxes(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, extracted []ExtractedItem) error {
	for _, e := range extracted {
		if e.Taxes.Empty() {
			continue
		}
		_, err := tx.Exec(ctx, `
			update organization_nfe_items
			set taxes_json = $4
			where organization_id = $1 and organization_document_id = $2 and item_number = $3
			  and coalesce(taxes_json, '{}'::jsonb) = '{}'::jsonb
		`, organizationID, documentID, e.ItemNumber, taxesJSON(&e.Taxes))
		if err != nil {
			return err
		}
	}
	return nil
}
