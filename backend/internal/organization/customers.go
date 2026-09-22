package organization

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/audit"
	"github.com/nexus/fiscal-messaging/internal/platform/catalogs"
	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// Customer is an organization-level NFS-e tomador (shared across companies).
type Customer struct {
	ID                    uuid.UUID `json:"id"`
	OrganizationID        uuid.UUID `json:"organization_id"`
	CPF                   *string   `json:"cpf,omitempty"`
	CNPJ                  *string   `json:"cnpj,omitempty"`
	NIF                   *string   `json:"nif,omitempty"`
	LegalName             string    `json:"legal_name"`
	Email                 *string   `json:"email,omitempty"`
	Phone                 *string   `json:"phone,omitempty"`
	MunicipalRegistration *string   `json:"municipal_registration,omitempty"`
	Street                *string   `json:"street,omitempty"`
	StreetType            *string   `json:"street_type,omitempty"`
	Number                *string   `json:"number,omitempty"`
	Complement            *string   `json:"complement,omitempty"`
	District              *string   `json:"district,omitempty"`
	MunicipalityCode      *string   `json:"municipality_code,omitempty"`
	UF                    *string   `json:"uf,omitempty"`
	CEP                   *string   `json:"cep,omitempty"`
	ForeignCountryCode    *string   `json:"foreign_country_code,omitempty"`
	ForeignCEP            *string   `json:"foreign_cep,omitempty"`
	ForeignCity           *string   `json:"foreign_city,omitempty"`
	ForeignRegion         *string   `json:"foreign_region,omitempty"`
	Status                string    `json:"status"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
	// FromHistory marks rows synthesized from past NFS-e takers (not yet saved).
	FromHistory bool `json:"from_history,omitempty"`
}

type CreateCustomerInput struct {
	OrganizationID        uuid.UUID
	CPF                   string
	CNPJ                  string
	NIF                   string
	LegalName             string
	Email                 string
	Phone                 string
	MunicipalRegistration string
	Street                string
	StreetType            string
	Number                string
	Complement            string
	District              string
	MunicipalityCode      string
	UF                    string
	CEP                   string
	ActorUserID           uuid.UUID
}

type UpdateCustomerInput struct {
	OrganizationID        uuid.UUID
	CustomerID            uuid.UUID
	LegalName             string
	Email                 string
	Phone                 string
	MunicipalRegistration string
	Street                string
	StreetType            string
	Number                string
	Complement            string
	District              string
	MunicipalityCode      string
	UF                    string
	CEP                   string
	Status                string
	ActorUserID           uuid.UUID
}

func normalizeDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func optionalTrimmed(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func validateCustomerDocument(cpf, cnpj, nif string) (cpfOut, cnpjOut, nifOut *string, err error) {
	cpf = normalizeDigits(cpf)
	cnpj = normalizeDigits(cnpj)
	nif = strings.TrimSpace(nif)
	count := 0
	if cpf != "" {
		count++
		if len(cpf) != 11 {
			return nil, nil, nil, domainerr.Validation("invalid_cpf", "CPF must contain 11 digits")
		}
		cpfOut = &cpf
	}
	if cnpj != "" {
		count++
		if len(cnpj) != 14 || !ValidCNPJ(cnpj) {
			return nil, nil, nil, domainerr.Validation("invalid_cnpj", "CNPJ must contain 14 valid digits")
		}
		cnpjOut = &cnpj
	}
	if nif != "" {
		count++
		nifOut = &nif
	}
	if count != 1 {
		return nil, nil, nil, domainerr.Validation("invalid_document", "Provide exactly one of cpf, cnpj, or nif")
	}
	return cpfOut, cnpjOut, nifOut, nil
}

func (s *Service) ListCustomers(ctx context.Context, organizationID uuid.UUID, query string, includeHistory bool) ([]Customer, error) {
	q := strings.TrimSpace(strings.ToLower(query))
	rows, err := s.pool.Query(ctx, `
		select id, organization_id, cpf, cnpj, nif, legal_name, email, phone, municipal_registration,
		       street, street_type, number, complement, district, municipality_code, uf, cep,
		       foreign_country_code, foreign_cep, foreign_city, foreign_region,
		       status, created_at, updated_at
		from organization_customers
		where organization_id = $1
		  and status = 'active'
		  and (
		    $2 = ''
		    or lower(legal_name) like '%' || $2 || '%'
		    or lower(coalesce(email, '')) like '%' || $2 || '%'
		    or coalesce(cpf, '') like '%' || $2 || '%'
		    or coalesce(cnpj, '') like '%' || $2 || '%'
		    or coalesce(nif, '') like '%' || $2 || '%'
		  )
		order by legal_name
		limit 200
	`, organizationID, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Customer
	seenDocs := map[string]bool{}
	for rows.Next() {
		c, err := scanCustomer(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
		if c.CPF != nil {
			seenDocs["cpf:"+*c.CPF] = true
		}
		if c.CNPJ != nil {
			seenDocs["cnpj:"+*c.CNPJ] = true
		}
		if c.NIF != nil {
			seenDocs["nif:"+*c.NIF] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Merge recent distinct takers from emitted NFS-e that are not yet registered.
	if includeHistory && q == "" {
		hist, err := s.listHistoryCustomers(ctx, organizationID, seenDocs)
		if err != nil {
			return nil, err
		}
		out = append(out, hist...)
	}
	return out, nil
}

func (s *Service) listHistoryCustomers(ctx context.Context, organizationID uuid.UUID, seen map[string]bool) ([]Customer, error) {
	rows, err := s.pool.Query(ctx, `
		select distinct on (coalesce(taker_cnpj, ''), coalesce(taker_cpf, ''), coalesce(taker_nif, ''))
		       taker_cpf, taker_cnpj, taker_nif, taker_legal_name, taker_email, taker_phone, taker_im,
		       taker_street, taker_street_type, taker_number, taker_complement, taker_district,
		       taker_municipality_code, taker_uf, taker_cep
		from organization_nfse
		where organization_id = $1
		  and (
		    nullif(taker_cnpj, '') is not null
		    or nullif(taker_cpf, '') is not null
		    or nullif(taker_nif, '') is not null
		  )
		  and nullif(taker_legal_name, '') is not null
		order by coalesce(taker_cnpj, ''), coalesce(taker_cpf, ''), coalesce(taker_nif, ''), emission_date desc nulls last
		limit 100
	`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Customer
	for rows.Next() {
		var cpf, cnpj, nif, name, email, phone, im *string
		var street, streetType, number, complement, district, mun, uf, cep *string
		if err := rows.Scan(&cpf, &cnpj, &nif, &name, &email, &phone, &im, &street, &streetType, &number, &complement, &district, &mun, &uf, &cep); err != nil {
			return nil, err
		}
		key := ""
		if cnpj != nil && *cnpj != "" {
			key = "cnpj:" + *cnpj
		} else if cpf != nil && *cpf != "" {
			key = "cpf:" + *cpf
		} else if nif != nil && *nif != "" {
			key = "nif:" + *nif
		}
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		legalName := ""
		if name != nil {
			legalName = *name
		}
		out = append(out, Customer{
			OrganizationID:        organizationID,
			CPF:                   cpf,
			CNPJ:                  cnpj,
			NIF:                   nif,
			LegalName:             legalName,
			Email:                 email,
			Phone:                 phone,
			MunicipalRegistration: im,
			Street:                street,
			StreetType:            streetType,
			Number:                number,
			Complement:            complement,
			District:              district,
			MunicipalityCode:      mun,
			UF:                    uf,
			CEP:                   cep,
			Status:                "active",
			FromHistory:           true,
		})
	}
	return out, rows.Err()
}

func (s *Service) GetCustomer(ctx context.Context, organizationID, customerID uuid.UUID) (*Customer, error) {
	row := s.pool.QueryRow(ctx, `
		select id, organization_id, cpf, cnpj, nif, legal_name, email, phone, municipal_registration,
		       street, street_type, number, complement, district, municipality_code, uf, cep,
		       foreign_country_code, foreign_cep, foreign_city, foreign_region,
		       status, created_at, updated_at
		from organization_customers
		where organization_id = $1 and id = $2
	`, organizationID, customerID)
	c, err := scanCustomer(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domainerr.NotFound("customer_not_found", "Customer not found")
		}
		return nil, err
	}
	return &c, nil
}

func (s *Service) CreateCustomer(ctx context.Context, in CreateCustomerInput) (*Customer, error) {
	legalName := strings.TrimSpace(in.LegalName)
	if legalName == "" {
		return nil, domainerr.Validation("invalid_customer", "legal_name is required")
	}
	cpf, cnpj, nif, err := validateCustomerDocument(in.CPF, in.CNPJ, in.NIF)
	if err != nil {
		return nil, err
	}
	uf := strings.ToUpper(strings.TrimSpace(in.UF))
	if uf != "" {
		if _, ok := validUFs[uf]; !ok {
			return nil, domainerr.Validation("invalid_uf", "uf must be a valid Brazilian state code")
		}
	}
	mun := normalizeDigits(in.MunicipalityCode)
	if mun != "" && len(mun) != 7 {
		return nil, domainerr.Validation("invalid_municipality_code", "municipality_code must be 7 IBGE digits")
	}
	if mun != "" {
		if cat, catErr := catalogs.Get(); catErr == nil {
			if _, ok := cat.LookupMunicipality(mun); !ok {
				return nil, domainerr.Validation("unknown_municipality_code", "municipality_code is not in the IBGE catalog")
			}
		}
	}
	cep := normalizeDigits(in.CEP)
	if cep != "" && len(cep) != 8 {
		return nil, domainerr.Validation("invalid_cep", "cep must contain 8 digits")
	}

	now := time.Now().UTC()
	customer := &Customer{
		ID:                    ids.New(),
		OrganizationID:        in.OrganizationID,
		CPF:                   cpf,
		CNPJ:                  cnpj,
		NIF:                   nif,
		LegalName:             legalName,
		Email:                 optionalTrimmed(in.Email),
		Phone:                 optionalTrimmed(normalizeDigits(in.Phone)),
		MunicipalRegistration: optionalTrimmed(in.MunicipalRegistration),
		Street:                optionalTrimmed(in.Street),
		StreetType:            optionalTrimmed(in.StreetType),
		Number:                optionalTrimmed(in.Number),
		Complement:            optionalTrimmed(in.Complement),
		District:              optionalTrimmed(in.District),
		MunicipalityCode:      optionalTrimmed(mun),
		UF:                    optionalTrimmed(uf),
		CEP:                   optionalTrimmed(cep),
		Status:                "active",
		CreatedAt:             now,
		UpdatedAt:             now,
	}

	err = s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			insert into organization_customers (
				id, organization_id, cpf, cnpj, nif, legal_name, email, phone, municipal_registration,
				street, street_type, number, complement, district, municipality_code, uf, cep,
				status, created_at, updated_at
			) values (
				$1,$2,$3,$4,$5,$6,$7,$8,$9,
				$10,$11,$12,$13,$14,$15,$16,$17,
				$18,$19,$20
			)
		`, customer.ID, customer.OrganizationID, customer.CPF, customer.CNPJ, customer.NIF, customer.LegalName,
			customer.Email, customer.Phone, customer.MunicipalRegistration,
			customer.Street, customer.StreetType, customer.Number, customer.Complement, customer.District,
			customer.MunicipalityCode, customer.UF, customer.CEP,
			customer.Status, customer.CreatedAt, customer.UpdatedAt)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "customer.create",
			ResourceType:   "organization_customers",
			ResourceID:     customer.ID.String(),
			After:          customer,
		})
	})
	if err != nil {
		if strings.Contains(err.Error(), "uq_organization_customers") {
			return nil, domainerr.Conflict("customer_already_exists", "Customer with this document already exists")
		}
		return nil, err
	}
	return customer, nil
}

func (s *Service) UpdateCustomer(ctx context.Context, in UpdateCustomerInput) (*Customer, error) {
	legalName := strings.TrimSpace(in.LegalName)
	if legalName == "" {
		return nil, domainerr.Validation("invalid_customer", "legal_name is required")
	}
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "archived" {
		return nil, domainerr.Validation("invalid_status", "status must be active or archived")
	}
	uf := strings.ToUpper(strings.TrimSpace(in.UF))
	if uf != "" {
		if _, ok := validUFs[uf]; !ok {
			return nil, domainerr.Validation("invalid_uf", "uf must be a valid Brazilian state code")
		}
	}
	mun := normalizeDigits(in.MunicipalityCode)
	if mun != "" && len(mun) != 7 {
		return nil, domainerr.Validation("invalid_municipality_code", "municipality_code must be 7 IBGE digits")
	}
	if mun != "" {
		if cat, catErr := catalogs.Get(); catErr == nil {
			if _, ok := cat.LookupMunicipality(mun); !ok {
				return nil, domainerr.Validation("unknown_municipality_code", "municipality_code is not in the IBGE catalog")
			}
		}
	}
	cep := normalizeDigits(in.CEP)
	if cep != "" && len(cep) != 8 {
		return nil, domainerr.Validation("invalid_cep", "cep must contain 8 digits")
	}

	var customer Customer
	err := s.pool.WithTenant(ctx, in.OrganizationID, func(ctx context.Context, tx pgx.Tx) error {
		now := time.Now().UTC()
		tag, err := tx.Exec(ctx, `
			update organization_customers set
				legal_name = $3,
				email = $4,
				phone = $5,
				municipal_registration = $6,
				street = $7,
				street_type = $8,
				number = $9,
				complement = $10,
				district = $11,
				municipality_code = $12,
				uf = $13,
				cep = $14,
				status = $15,
				updated_at = $16
			where organization_id = $1 and id = $2
		`, in.OrganizationID, in.CustomerID, legalName,
			optionalTrimmed(in.Email), optionalTrimmed(normalizeDigits(in.Phone)), optionalTrimmed(in.MunicipalRegistration),
			optionalTrimmed(in.Street), optionalTrimmed(in.StreetType), optionalTrimmed(in.Number),
			optionalTrimmed(in.Complement), optionalTrimmed(in.District), optionalTrimmed(mun),
			optionalTrimmed(uf), optionalTrimmed(cep), status, now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return domainerr.NotFound("customer_not_found", "Customer not found")
		}
		row := tx.QueryRow(ctx, `
			select id, organization_id, cpf, cnpj, nif, legal_name, email, phone, municipal_registration,
			       street, street_type, number, complement, district, municipality_code, uf, cep,
			       foreign_country_code, foreign_cep, foreign_city, foreign_region,
			       status, created_at, updated_at
			from organization_customers
			where organization_id = $1 and id = $2
		`, in.OrganizationID, in.CustomerID)
		customer, err = scanCustomer(row)
		if err != nil {
			return err
		}
		return audit.Write(ctx, tx, audit.Event{
			OrganizationID: &in.OrganizationID,
			ActorType:      "user",
			ActorID:        in.ActorUserID.String(),
			Action:         "customer.update",
			ResourceType:   "organization_customers",
			ResourceID:     in.CustomerID.String(),
			After:          customer,
		})
	})
	if err != nil {
		return nil, err
	}
	return &customer, nil
}

type customerScanner interface {
	Scan(dest ...any) error
}

func scanCustomer(row customerScanner) (Customer, error) {
	var c Customer
	err := row.Scan(
		&c.ID, &c.OrganizationID, &c.CPF, &c.CNPJ, &c.NIF, &c.LegalName, &c.Email, &c.Phone, &c.MunicipalRegistration,
		&c.Street, &c.StreetType, &c.Number, &c.Complement, &c.District, &c.MunicipalityCode, &c.UF, &c.CEP,
		&c.ForeignCountryCode, &c.ForeignCEP, &c.ForeignCity, &c.ForeignRegion,
		&c.Status, &c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}
