package organization

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// SetOrganizationLogo stores the tenant mark used in the app UI (switcher,
// organization page). Company DANFE/DANFSe logos stay on organization_companies.
func (s *Service) SetOrganizationLogo(ctx context.Context, organizationID, actorID uuid.UUID, data []byte) (*Organization, error) {
	ct, err := validateCompanyLogo(data)
	if err != nil {
		return nil, err
	}
	err = s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organizations
			set logo = $2, logo_content_type = $3, updated_at = now()
			where id = $1
		`, organizationID, data, ct)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("organization_not_found", "Organization not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorID.String(),
			Action:         "organization.logo.upload",
			ResourceType:   "organizations",
			ResourceID:     organizationID.String(),
			After: map[string]any{
				"content_type": ct,
				"bytes":        len(data),
			},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetOrganization(ctx, organizationID)
}

func (s *Service) DeleteOrganizationLogo(ctx context.Context, organizationID, actorID uuid.UUID) (*Organization, error) {
	err := s.pool.WithTx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			update organizations
			set logo = null, logo_content_type = null, updated_at = now()
			where id = $1
		`, organizationID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("organization_not_found", "Organization not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorID.String(),
			Action:         "organization.logo.delete",
			ResourceType:   "organizations",
			ResourceID:     organizationID.String(),
			After:          map[string]any{"removed": true},
		})
	})
	if err != nil {
		return nil, err
	}
	return s.GetOrganization(ctx, organizationID)
}

// GetOrganizationLogo returns the uploaded organization mark bytes.
func (s *Service) GetOrganizationLogo(ctx context.Context, organizationID uuid.UUID) ([]byte, string, error) {
	var data []byte
	var ct *string
	err := s.pool.QueryRow(ctx, `
		select logo, logo_content_type
		from organizations
		where id = $1 and logo is not null
	`, organizationID).Scan(&data, &ct)
	if err != nil || len(data) == 0 {
		return nil, "", domainerr.NotFound("logo_not_found", "Organization logo not found")
	}
	contentType := "image/png"
	if ct != nil && strings.TrimSpace(*ct) != "" {
		contentType = *ct
	}
	return data, contentType, nil
}
