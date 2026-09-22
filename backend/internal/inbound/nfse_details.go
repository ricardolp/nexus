package inbound

import "strings"

// NFSeDetails is the extra payload the detail screen needs for an NFS-e:
// prestador/tomador names and the service/tax block (one service per note).
type NFSeDetails struct {
	Issuer    NFeParty     `json:"issuer"`
	Recipient NFeParty     `json:"recipient"`
	Service   *NFSeService `json:"service,omitempty"`
}

// NFSeService maps the DPS <serv> + <valores> block onto JSON the UI can render
// as the "serviço" tab (equivalent to NF-e items) and the taxes tab.
type NFSeService struct {
	Description          string   `json:"description,omitempty"`
	NationalTaxCode      string   `json:"national_tax_code,omitempty"`
	NBS                  string   `json:"nbs,omitempty"`
	MunicipalityCode     string   `json:"municipality_code,omitempty"`
	CNAE                 string   `json:"cnae,omitempty"`
	Amount               *float64 `json:"amount,omitempty"`
	NatureOfOperation    string   `json:"nature_of_operation,omitempty"`
	ISSWithheld          *bool    `json:"iss_withheld,omitempty"`
	ISSRate              *float64 `json:"iss_rate,omitempty"`
	ISSAmount            *float64 `json:"iss_amount,omitempty"`
	PisCofinsCST         string   `json:"pis_cofins_cst,omitempty"`
	PisCofinsWithholding string   `json:"pis_cofins_withholding,omitempty"`
	PISAmount            *float64 `json:"pis_amount,omitempty"`
	COFINSAmount         *float64 `json:"cofins_amount,omitempty"`
	TotalTaxesPercent    *float64 `json:"total_taxes_percent,omitempty"`
}

func (d NFSeDetails) Empty() bool {
	return d.Issuer.LegalName == "" && d.Recipient.LegalName == "" && (d.Service == nil || d.Service.Empty())
}

func (s *NFSeService) Empty() bool {
	if s == nil {
		return true
	}
	return s.Description == "" && s.NationalTaxCode == "" && s.NBS == "" && s.Amount == nil
}

func ptrText(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}

func nfsePartyDocument(cnpj, cpf *string) (cnpjOut, cpfOut string) {
	if v := ptrText(cnpj); v != "" {
		return v, ""
	}
	return "", ptrText(cpf)
}

func buildNFSeDetails(
	issuerCNPJ, companyName, companyTrade, issuerIM, issuerUF, issuerCityCode *string,
	takerCNPJ, takerCPF, takerLegal, takerIM, takerPhone, takerEmail *string,
	takerStreet, takerNumber, takerComplement, takerDistrict, takerCityCode, takerUF, takerCEP *string,
	discrimination, nbs, listItem, munTax, serviceMun, cnae, nature, pisCST, pisRet *string,
	serviceAmount, issRate, issAmount, pisAmount, cofinsAmount, totTrib *float64,
	issWithheld *bool,
	fallbackIssuerDoc *string,
) *NFSeDetails {
	cnpj, cpf := nfsePartyDocument(takerCNPJ, takerCPF)
	issuerDoc := firstNonEmpty(ptrText(issuerCNPJ), ptrText(fallbackIssuerDoc))
	details := NFSeDetails{
		Issuer: NFeParty{
			CNPJ:      issuerDoc,
			LegalName: ptrText(companyName),
			TradeName: ptrText(companyTrade),
			IM:        ptrText(issuerIM),
		},
		Recipient: NFeParty{
			CNPJ:      cnpj,
			CPF:       cpf,
			LegalName: ptrText(takerLegal),
			IM:        ptrText(takerIM),
			Email:     ptrText(takerEmail),
			Address: addressOrNil(
				takerStreet, takerNumber, takerComplement, takerDistrict,
				takerCityCode, nil, takerUF, takerCEP, takerPhone,
			),
		},
	}
	if uf := ptrText(issuerUF); uf != "" {
		details.Issuer.Address = &NFeAddress{
			UF:       uf,
			CityCode: ptrText(issuerCityCode),
		}
	}
	svc := &NFSeService{
		Description:          ptrText(discrimination),
		NationalTaxCode:      firstNonEmpty(ptrText(listItem), ptrText(munTax)),
		NBS:                  ptrText(nbs),
		MunicipalityCode:     ptrText(serviceMun),
		CNAE:                 ptrText(cnae),
		Amount:               serviceAmount,
		NatureOfOperation:    ptrText(nature),
		ISSWithheld:          issWithheld,
		ISSRate:              issRate,
		ISSAmount:            issAmount,
		PisCofinsCST:         ptrText(pisCST),
		PisCofinsWithholding: ptrText(pisRet),
		PISAmount:            pisAmount,
		COFINSAmount:         cofinsAmount,
		TotalTaxesPercent:    totTrib,
	}
	if !svc.Empty() {
		details.Service = svc
	}
	if details.Empty() {
		return nil
	}
	return &details
}
