package organization

import "github.com/jackc/pgx/v5"

const companySelectColumns = `
	id, organization_id, legal_name, trade_name, cnpj, uf,
	municipal_registration, ibge_municipality_code,
	tax_regime, special_tax_regime,
	environment, status,
	danfse_custom_logo_enabled, (danfse_logo is not null),
	metadata_json, created_at, updated_at
`

type companyScanner interface {
	Scan(dest ...any) error
}

func scanCompany(row companyScanner) (Company, error) {
	var c Company
	err := row.Scan(
		&c.ID, &c.OrganizationID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.UF,
		&c.MunicipalRegistration, &c.IBGEMunicipalityCode,
		&c.TaxRegime, &c.SpecialTaxRegime,
		&c.Environment, &c.Status,
		&c.DanfseCustomLogoEnabled, &c.HasDanfseLogo,
		&c.MetadataJSON, &c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func scanCompanyRows(rows pgx.Rows) ([]Company, error) {
	var out []Company
	for rows.Next() {
		c, err := scanCompany(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
