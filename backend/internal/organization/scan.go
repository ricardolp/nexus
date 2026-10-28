package organization

// organizationSelectCols is the shared projection for Organization JSON rows.
// has_logo is derived from the binary logo column (not logo_url).
const organizationSelectCols = `
	id, legal_name, trade_name, slug, tax_identifier, logo_url,
	(logo is not null), status, timezone, default_locale, created_at, updated_at
`

type orgScanner interface {
	Scan(dest ...any) error
}

func scanOrganization(row orgScanner, org *Organization) error {
	return row.Scan(
		&org.ID, &org.LegalName, &org.TradeName, &org.Slug, &org.TaxIdentifier, &org.LogoURL,
		&org.HasLogo, &org.Status, &org.Timezone, &org.DefaultLocale, &org.CreatedAt, &org.UpdatedAt,
	)
}
