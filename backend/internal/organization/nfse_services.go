package organization

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// CompanyNFSeService is a company activity catalog row (CNAE + description).
// LC116 item and NBS are optional here and chosen at emission time.
type CompanyNFSeService struct {
	ID                    uuid.UUID `json:"id"`
	OrganizationID        uuid.UUID `json:"organization_id"`
	OrganizationCompanyID uuid.UUID `json:"organization_company_id"`
	CNAECode              string    `json:"cnae_code"`
	CNAEDescription       *string   `json:"cnae_description,omitempty"`
	ServiceListItem       *string   `json:"service_list_item,omitempty"`
	ServiceDescription    *string   `json:"service_description,omitempty"`
	NBSCode               *string   `json:"nbs_code,omitempty"`
	NBSDescription        *string   `json:"nbs_description,omitempty"`
	DefaultISSAliquot     *float64  `json:"default_iss_aliquot,omitempty"`
	DefaultDiscrimination *string   `json:"default_discrimination,omitempty"`
	IsPrimary             bool      `json:"is_primary"`
	IsFavorite            bool      `json:"is_favorite"`
	SortOrder             int       `json:"sort_order"`
	Status                string    `json:"status"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type UpsertCompanyNFSeServiceInput struct {
	OrganizationID        uuid.UUID
	CompanyID             uuid.UUID
	ServiceID             uuid.UUID // empty on create
	CNAECode              string
	CNAEDescription       string
	ServiceListItem       string
	ServiceDescription    string
	NBSCode               string
	NBSDescription        string
	DefaultISSAliquot     *float64
	DefaultDiscrimination string
	IsPrimary             bool
	IsFavorite            bool
	SortOrder             int
	Status                string
	ActorUserID           uuid.UUID
}

func (s *Service) ListCompanyNFSeServices(ctx context.Context, organizationID, companyID uuid.UUID) ([]CompanyNFSeService, error) {
	if err := s.ensureCompany(ctx, organizationID, companyID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, organization_company_id,
		       cnae_code, cnae_description, service_list_item, service_description,
		       nbs_code, nbs_description, default_iss_aliquot, default_discrimination,
		       is_primary, is_favorite, sort_order, status, created_at, updated_at
		from organization_company_nfse_services
		where organization_id = $1 and organization_company_id = $2
		order by is_primary desc, is_favorite desc, sort_order, cnae_code, service_list_item
	`, organizationID, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CompanyNFSeService
	for rows.Next() {
		item, err := scanNFSeService(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Service) CreateCompanyNFSeService(ctx context.Context, in UpsertCompanyNFSeServiceInput) (*CompanyNFSeService, error) {
	in.ServiceID = uuid.Nil
	return s.upsertCompanyNFSeService(ctx, in)
}

func (s *Service) UpdateCompanyNFSeService(ctx context.Context, in UpsertCompanyNFSeServiceInput) (*CompanyNFSeService, error) {
	if in.ServiceID == uuid.Nil {
		return nil, domainerr.Validation("invalid_service_id", "service id is required")
	}
	return s.upsertCompanyNFSeService(ctx, in)
}

func (s *Service) DeleteCompanyNFSeService(ctx context.Context, organizationID, companyID, serviceID, actorUserID uuid.UUID) error {
	return s.pool.WithTenant(ctx, organizationID, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			delete from organization_company_nfse_services
			where organization_id = $1 and organization_company_id = $2 and id = $3
		`, organizationID, companyID, serviceID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("nfse_service_not_found", "NFS-e service catalog entry not found")
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &organizationID,
			ActorType:      "user",
			ActorID:        actorUserID.String(),
			Action:         "company.nfse_service.delete",
			ResourceType:   "organization_company_nfse_services",
			ResourceID:     serviceID.String(),
		})
	})
}

func (s *Service) upsertCompanyNFSeService(ctx context.Context, in UpsertCompanyNFSeServiceInput) (*CompanyNFSeService, error) {
	cnae := onlyDigits(in.CNAECode)
	desc := strings.TrimSpace(in.ServiceDescription)
	item := strings.TrimSpace(in.ServiceListItem)
	nbs := strings.TrimSpace(in.NBSCode)
	if cnae == "" || desc == "" {
		return nil, domainerr.Validation("invalid_nfse_service", "cnae_code and service_description are required")
	}
	if len(cnae) != 7 {
		return nil, domainerr.Validation("invalid_cnae_code", "cnae_code must contain 7 digits")
	}
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "disabled" {
		return nil, domainerr.Validation("invalid_status", "status must be active or disabled")
	}
	if err := s.ensureCompany(ctx, in.OrganizationID, in.CompanyID); err != nil {
		return nil, err
	}

	cat, err := catalogs.Get()
	if err != nil {
		return nil, err
	}
	officialCNAE, ok := cat.LookupCNAE(cnae)
	if !ok {
		return nil, domainerr.Validation("unknown_cnae_code", "CNAE code is not in the official catalog")
	}

	var nbsDesc string
	if nbs != "" {
		officialNBS, ok := cat.LookupNBS(nbs)
		if !ok {
			return nil, domainerr.Validation("unknown_nbs_code", "NBS code is not in the official catalog")
		}
		nbs = officialNBS.Code
		nbsDesc = strings.TrimSpace(in.NBSDescription)
		if nbsDesc == "" {
			nbsDesc = officialNBS.Description
		}
	}

	hasCompanyCNAE, err := s.companyHasCNAE(ctx, in.OrganizationID, in.CompanyID, cnae)
	if err != nil {
		return nil, err
	}
	if !hasCompanyCNAE {
		return nil, domainerr.Validation(
			"cnae_not_in_company",
			"CNAE must belong to the company catalog — sync CNAEs from Receita first",
		)
	}

	cnaeDesc := strings.TrimSpace(in.CNAEDescription)
	if cnaeDesc == "" {
		cnaeDesc = officialCNAE.Description
	}

	var aliquot *float64
	if in.DefaultISSAliquot != nil {
		v := *in.DefaultISSAliquot
		aliquot = &v
	}

	now := time.Now().UTC()
	creating := in.ServiceID == uuid.Nil
	if creating {
		in.ServiceID = ids.New()
	}

	var out CompanyNFSeService
	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		if in.IsPrimary {
			if _, err := tx.Exec(ctx, `
				update organization_company_nfse_services
				set is_primary = false, updated_at = $3
				where organization_company_id = $1 and organization_id = $2 and is_primary = true
			`, in.CompanyID, in.OrganizationID, now); err != nil {
				return err
			}
		}

		if creating {
			_, err := tx.Exec(ctx, `
				insert into organization_company_nfse_services (
					id, organization_id, organization_company_id,
					cnae_code, cnae_description, service_list_item, service_description,
					nbs_code, nbs_description, default_iss_aliquot, default_discrimination,
					is_primary, is_favorite, sort_order, status, created_at, updated_at
				) values (
					$1,$2,$3,
					$4,$5,$6,$7,
					$8,$9,$10,$11,
					$12,$13,$14,$15,$16,$16
				)
			`, in.ServiceID, in.OrganizationID, in.CompanyID,
				cnae, optionalTrimmed(cnaeDesc), optionalTrimmed(item), optionalTrimmed(desc),
				optionalTrimmed(nbs), optionalTrimmed(nbsDesc), aliquot, optionalTrimmed(in.DefaultDiscrimination),
				in.IsPrimary, in.IsFavorite, in.SortOrder, status, now)
			if err != nil {
				return err
			}
		} else {
			tag, err := tx.Exec(ctx, `
				update organization_company_nfse_services set
					cnae_code = $4,
					cnae_description = $5,
					service_list_item = $6,
					service_description = $7,
					nbs_code = $8,
					nbs_description = $9,
					default_iss_aliquot = $10,
					default_discrimination = $11,
					is_primary = $12,
					is_favorite = $13,
					sort_order = $14,
					status = $15,
					updated_at = $16
				where organization_id = $1 and organization_company_id = $2 and id = $3
			`, in.OrganizationID, in.CompanyID, in.ServiceID,
				cnae, optionalTrimmed(cnaeDesc), optionalTrimmed(item), optionalTrimmed(desc),
				optionalTrimmed(nbs), optionalTrimmed(nbsDesc), aliquot, optionalTrimmed(in.DefaultDiscrimination),
				in.IsPrimary, in.IsFavorite, in.SortOrder, status, now)
			if err != nil {
				return err
			}
			if tag.RowsAffected() == 0 {
				return domainerr.NotFound("nfse_service_not_found", "NFS-e service catalog entry not found")
			}
		}

		row := tx.QueryRow(ctx, `
			select id, organization_id, organization_company_id,
			       cnae_code, cnae_description, service_list_item, service_description,
			       nbs_code, nbs_description, default_iss_aliquot, default_discrimination,
			       is_primary, is_favorite, sort_order, status, created_at, updated_at
			from organization_company_nfse_services
			where id = $1
		`, in.ServiceID)
		var err error
		out, err = scanNFSeService(row)
		if err != nil {
			return err
		}
		action := "company.nfse_service.update"
		if creating {
			action = "company.nfse_service.create"
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         action,
			ResourceType:   "organization_company_nfse_services",
			ResourceID:     in.ServiceID.String(),
			After:          out,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "uq_org_company_nfse_services_cnae_desc") ||
			strings.Contains(err.Error(), "organization_company_nfse_services_organization_company_id_cnae_code_service_list_item_nbs_code_key") {
			return nil, domainerr.Conflict("nfse_service_exists", "This CNAE / description combination already exists for the company")
		}
		return nil, err
	}
	return &out, nil
}

func (s *Service) ensureCompany(ctx context.Context, organizationID, companyID uuid.UUID) error {
	var exists bool
	if err := s.pool.QueryRow(ctx, `
		select exists(select 1 from organization_companies where id = $1 and organization_id = $2)
	`, companyID, organizationID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return domainerr.NotFound("company_not_found", "Company not found")
	}
	return nil
}

type nfseServiceScanner interface {
	Scan(dest ...any) error
}

func scanNFSeService(row nfseServiceScanner) (CompanyNFSeService, error) {
	var item CompanyNFSeService
	err := row.Scan(
		&item.ID, &item.OrganizationID, &item.OrganizationCompanyID,
		&item.CNAECode, &item.CNAEDescription, &item.ServiceListItem, &item.ServiceDescription,
		&item.NBSCode, &item.NBSDescription, &item.DefaultISSAliquot, &item.DefaultDiscrimination,
		&item.IsPrimary, &item.IsFavorite, &item.SortOrder, &item.Status, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

// NextRPSSuggest suggests the next RPS series/number for outbound NFS-e based on
// the last issued document for the company. Defaults to series "1" / number "1".
type NextRPSSuggest struct {
	SerieRPS  string `json:"serie_rps"`
	NumeroRPS string `json:"numero_rps"`
	FromLast  bool   `json:"from_last"`
}

func (s *Service) SuggestNextRPS(ctx context.Context, organizationID, companyID uuid.UUID) (*NextRPSSuggest, error) {
	if err := s.ensureCompany(ctx, organizationID, companyID); err != nil {
		return nil, err
	}
	var series, number *string
	err := s.pool.QueryRow(ctx, `
		select n.rps_series, n.rps_number
		from organization_nfse n
		join organization_documents d on d.id = n.organization_document_id
		where d.organization_id = $1
		  and d.organization_company_id = $2
		  and d.document_type = 'nfse'
		  and d.direction = 'outbound'
		  and nullif(trim(n.rps_number), '') is not null
		order by coalesce(n.emission_date, d.received_at, d.created_at) desc
		limit 1
	`, organizationID, companyID).Scan(&series, &number)
	if err != nil {
		if err == pgx.ErrNoRows {
			return &NextRPSSuggest{SerieRPS: "1", NumeroRPS: "1", FromLast: false}, nil
		}
		return nil, err
	}
	serie := strings.TrimSpace(derefStr(series))
	if serie == "" {
		serie = "1"
	}
	nextNum := incrementNumericString(strings.TrimSpace(derefStr(number)))
	return &NextRPSSuggest{SerieRPS: serie, NumeroRPS: nextNum, FromLast: true}, nil
}

// LastNFSeClassification is the LC116 + NBS pair used on the most recent outbound
// NFS-e for a company (optionally filtered by CNAE).
type LastNFSeClassification struct {
	CNAECode          string  `json:"cnae_code"`
	ServiceListItem   string  `json:"item_lista_servico"`
	NBSCode           string  `json:"codigo_nbs"`
	NBSDescription    *string `json:"nbs_description,omitempty"`
}

func (s *Service) LastNFSeClassification(ctx context.Context, organizationID, companyID uuid.UUID, cnae string) (*LastNFSeClassification, error) {
	if err := s.ensureCompany(ctx, organizationID, companyID); err != nil {
		return nil, err
	}
	cnaeDigits := onlyDigits(cnae)
	var (
		cnaeCode *string
		listItem *string
		nbsCode  *string
	)
	var err error
	if cnaeDigits != "" {
		err = s.pool.QueryRow(ctx, `
			select n.cnae_code, n.service_list_item, n.nbs_code
			from organization_nfse n
			join organization_documents d on d.id = n.organization_document_id
			where d.organization_id = $1
			  and d.organization_company_id = $2
			  and d.document_type = 'nfse'
			  and d.direction = 'outbound'
			  and regexp_replace(coalesce(n.cnae_code, ''), '[^0-9]', '', 'g') = $3
			  and (
			    nullif(trim(n.service_list_item), '') is not null
			    or nullif(trim(n.nbs_code), '') is not null
			  )
			order by coalesce(n.emission_date, d.received_at, d.created_at) desc
			limit 1
		`, organizationID, companyID, cnaeDigits).Scan(&cnaeCode, &listItem, &nbsCode)
	} else {
		err = s.pool.QueryRow(ctx, `
			select n.cnae_code, n.service_list_item, n.nbs_code
			from organization_nfse n
			join organization_documents d on d.id = n.organization_document_id
			where d.organization_id = $1
			  and d.organization_company_id = $2
			  and d.document_type = 'nfse'
			  and d.direction = 'outbound'
			  and (
			    nullif(trim(n.service_list_item), '') is not null
			    or nullif(trim(n.nbs_code), '') is not null
			  )
			order by coalesce(n.emission_date, d.received_at, d.created_at) desc
			limit 1
		`, organizationID, companyID).Scan(&cnaeCode, &listItem, &nbsCode)
	}
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	out := &LastNFSeClassification{
		CNAECode:        strings.TrimSpace(derefStr(cnaeCode)),
		ServiceListItem: strings.TrimSpace(derefStr(listItem)),
		NBSCode:         strings.TrimSpace(derefStr(nbsCode)),
	}
	if out.ServiceListItem == "" && out.NBSCode == "" {
		return nil, nil
	}
	if out.NBSCode != "" {
		if store, err := catalogs.Get(); err == nil {
			if nbs, ok := store.LookupNBS(out.NBSCode); ok {
				desc := nbs.Description
				out.NBSDescription = &desc
			}
		}
	}
	return out, nil
}

func derefStr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func incrementNumericString(raw string) string {
	digits := onlyDigits(raw)
	if digits == "" {
		return "1"
	}
	// Preserve leading zeros width when possible.
	width := len(digits)
	n := 0
	for _, ch := range digits {
		n = n*10 + int(ch-'0')
	}
	n++
	out := fmt.Sprintf("%d", n)
	if len(out) < width {
		out = strings.Repeat("0", width-len(out)) + out
	}
	return out
}
