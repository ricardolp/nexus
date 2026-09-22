package inbound

import "testing"

func TestBuildNFSeDetails(t *testing.T) {
	company := "R L PINHEIRO TECNOLOGIA DA INFORMACAO LTDA"
	taker := "NOVA CONSULTORIA EM TECNOLOGIA DA INFORMACAO LTDA"
	cnpj := "48401828000111"
	takerCNPJ := "35934186000138"
	desc := "Prestacao de servicos de consultoria"
	nbs := "115011000"
	trib := "010601"
	mun := "4104204"
	amount := 500.00
	tot := 8.00
	cst := "00"
	ret := "0"
	withheld := false

	got := buildNFSeDetails(
		&cnpj, &company, nil, nil, nil, nil,
		&takerCNPJ, nil, &taker, nil, nil, nil,
		nil, nil, nil, nil, nil, nil, nil,
		&desc, &nbs, &trib, nil, &mun, nil, strPtr("1"), &cst, &ret,
		&amount, nil, nil, nil, nil, &tot,
		&withheld, &cnpj,
	)
	if got == nil {
		t.Fatal("expected nfse details")
	}
	if got.Issuer.LegalName != company {
		t.Fatalf("issuer name: got %q", got.Issuer.LegalName)
	}
	if got.Recipient.LegalName != taker {
		t.Fatalf("recipient name: got %q", got.Recipient.LegalName)
	}
	if got.Service == nil || got.Service.Description != desc {
		t.Fatalf("service: %+v", got.Service)
	}
	if got.Service.NationalTaxCode != trib || got.Service.NBS != nbs {
		t.Fatalf("classification: %+v", got.Service)
	}
	if got.Service.Amount == nil || *got.Service.Amount != amount {
		t.Fatalf("amount: %+v", got.Service.Amount)
	}
	if got.Service.TotalTaxesPercent == nil || *got.Service.TotalTaxesPercent != tot {
		t.Fatalf("tot trib: %+v", got.Service.TotalTaxesPercent)
	}
}

func strPtr(s string) *string { return &s }
