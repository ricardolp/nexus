package fiscal

import (
	"encoding/json"
	"os"
	"testing"
)

func TestParseSAPNFSePayload(t *testing.T) {
	payload, err := os.ReadFile("../../test/testdata/fiscal/sap_nfse_outbound.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	p, err := ParseSAPNFSePayload(payload)
	if err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}
	if err := ValidateSAPNFSeOutbound(p); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}

	if derefStr(p.Prestador.CNPJ) != "12345678000123" {
		t.Errorf("prestador.cnpj=%q", derefStr(p.Prestador.CNPJ))
	}
	if derefStr(p.Tomador.CNPJ) != "98765432000188" {
		t.Errorf("tomador.cnpj=%q", derefStr(p.Tomador.CNPJ))
	}
	if p.Tomador.Endereco == nil || derefStr(p.Tomador.Endereco.UF) != "SP" {
		t.Errorf("tomador.endereco.uf missing or unexpected")
	}
	if p.Servico.ValorServicos == nil || *p.Servico.ValorServicos != 1500 {
		t.Errorf("servico.valor_servicos=%v", p.Servico.ValorServicos)
	}
	if p.Servico.ISSRetido.Bool() {
		t.Error("expected iss_retido=false")
	}
	if !p.OptanteSimplesNacional.Bool() {
		t.Error("expected optante_simples_nacional=true")
	}
	if p.Servico.ClassificacaoTributaria() != "000001" {
		t.Errorf("classificacao=%q", p.Servico.ClassificacaoTributaria())
	}
	if p.Servico.CodigoTributario() != "1709" {
		t.Errorf("codigo_tributario=%q", p.Servico.CodigoTributario())
	}
}

func TestParseSAPNFSePayload_ABAPStringFlagsAndTruncatedNames(t *testing.T) {
	raw := `{
		"data_emissao": "2024-01-15T10:30:00-03:00",
		"natureza_operacao": "1",
		"serie_rps": "1",
		"numero_rps": "1001",
		"optante_simples_nacional": "X",
		"incentivador_cultural": "0",
		"prestador": {"cnpj": "12345678000123", "inscricao_municipal": "1", "codigo_municipio": "3550308"},
		"tomador": {"cnpj": "98765432000188", "razao_social": "T"},
		"servico": {
			"valor_servicos": 100,
			"iss_retido": "1",
			"item_lista_servico": "0107",
			"codigo_tributacao_municipio": "0107",
			"discriminacao": "consultoria",
			"codigo_municipio": "3550308",
			"ibs_cbs_classificacao_tributar": "400001"
		}
	}`
	p, err := ParseSAPNFSePayload([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if !p.OptanteSimplesNacional.Bool() {
		t.Error("ABAP 'X' should be true")
	}
	if p.IncentivadorCultural.Bool() {
		t.Error("ABAP '0' should be false")
	}
	if !p.Servico.ISSRetido.Bool() {
		t.Error("ABAP iss_retido '1' should be true")
	}
	if p.Servico.CodigoTributario() != "0107" {
		t.Errorf("alias codigo_tributacao_municipio=%q", p.Servico.CodigoTributario())
	}
	if p.Servico.ClassificacaoTributaria() != "400001" {
		t.Errorf("truncated ABAP name=%q", p.Servico.ClassificacaoTributaria())
	}

	out, err := json.Marshal(p.OptanteSimplesNacional)
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != "true" {
		t.Errorf("marshal FlexibleBool got %s", out)
	}
}

func TestParseSAPNFSePayload_InvalidJSON(t *testing.T) {
	if _, err := ParseSAPNFSePayload([]byte(`{invalid`)); err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestValidateSAPNFSeOutbound(t *testing.T) {
	valid := func() *SAPNFSePayload {
		cnpj := "12345678000123"
		toma := "98765432000188"
		item := "0107"
		disc := "serviço"
		mun := "3550308"
		nat := "1"
		dt := "2024-01-15T10:30:00-03:00"
		serie := "1"
		numero := "1001"
		val := 100.0
		return &SAPNFSePayload{
			DataEmissao:      &dt,
			NaturezaOperacao: &nat,
			SerieRPS:         &serie,
			NumeroRPS:        &numero,
			Prestador:        SAPNFSePrestador{CNPJ: &cnpj, CodigoMunicipio: &mun},
			Tomador:          SAPNFSeTomador{CNPJ: &toma},
			Servico: SAPNFSeServico{
				ValorServicos:    &val,
				ItemListaServico: &item,
				Discriminacao:    &disc,
				CodigoMunicipio:  &mun,
			},
		}
	}

	t.Run("ok", func(t *testing.T) {
		if err := ValidateSAPNFSeOutbound(valid()); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("missing_issuer", func(t *testing.T) {
		p := valid()
		p.Prestador.CNPJ = nil
		if err := ValidateSAPNFSeOutbound(p); err == nil {
			t.Fatal("expected missing_issuer")
		}
	})
	t.Run("foreign_tomador_nif", func(t *testing.T) {
		p := valid()
		p.Tomador.CNPJ = nil
		nif := "EU123"
		p.Tomador.NIF = &nif
		if err := ValidateSAPNFSeOutbound(p); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("missing_rps", func(t *testing.T) {
		p := valid()
		p.SerieRPS = nil
		p.NumeroRPS = nil
		if err := ValidateSAPNFSeOutbound(p); err == nil {
			t.Fatal("expected missing RPS")
		}
	})
}

func TestExtractNFSeFromPayload(t *testing.T) {
	t.Parallel()

	t.Run("nested_sap_json", func(t *testing.T) {
		t.Parallel()
		payload, err := os.ReadFile("../../test/testdata/fiscal/sap_nfse_outbound.json")
		if err != nil {
			t.Fatal(err)
		}
		got := extractNFSeFromPayload(payload)
		if got.IssuerCNPJ != "12345678000123" {
			t.Errorf("issuer=%q", got.IssuerCNPJ)
		}
		if got.MunicipalityCode != "3550308" {
			t.Errorf("municipio=%q", got.MunicipalityCode)
		}
	})

	t.Run("non_json_is_noop", func(t *testing.T) {
		t.Parallel()
		got := extractNFSeFromPayload([]byte("not json"))
		if got.IssuerCNPJ != "" {
			t.Fatalf("expected zero, got %#v", got)
		}
	})
}

func TestMergeNFSe(t *testing.T) {
	explicit := &NFSeExtension{RPSNumber: "9", IssuerCNPJ: "explicit"}
	parsed := NFSeExtension{RPSNumber: "1", RPSSeries: "A", IssuerCNPJ: "parsed", MunicipalityCode: "3550308"}
	got := mergeNFSe(explicit, parsed)
	if got.RPSNumber != "9" || got.IssuerCNPJ != "explicit" {
		t.Errorf("explicit should win: %#v", got)
	}
	if got.RPSSeries != "A" || got.MunicipalityCode != "3550308" {
		t.Errorf("parsed should fill gaps: %#v", got)
	}
}
