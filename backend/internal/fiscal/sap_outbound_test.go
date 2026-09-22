package fiscal

import (
	"encoding/json"
	"os"
	"testing"
)

func TestParseSAPNFePayload(t *testing.T) {
	payload, err := os.ReadFile("../../test/testdata/fiscal/sap_nfe_outbound.json")
	if err != nil {
		t.Fatalf("Failed to read fixture: %v", err)
	}

	p, err := ParseSAPNFePayload(payload)
	if err != nil {
		t.Fatalf("Failed to parse payload: %v", err)
	}

	// Verify essential fields (Portuguese flat names)
	if p.Serie == nil || *p.Serie != "1" {
		t.Errorf("Expected serie=1, got %v", p.Serie)
	}
	if p.Numero == nil || *p.Numero != "12345" {
		t.Errorf("Expected numero=12345, got %v", p.Numero)
	}
	if p.CnpjEmitente == nil || *p.CnpjEmitente != "12345678000195" {
		t.Errorf("Expected cnpj_emitente=12345678000195, got %v", p.CnpjEmitente)
	}
	if p.NomeEmitente == nil || *p.NomeEmitente != "EMPRESA EMISSORA LTDA" {
		t.Errorf("Expected nome_emitente=EMPRESA EMISSORA LTDA, got %v", p.NomeEmitente)
	}
	if p.CnpjDestinatario == nil || *p.CnpjDestinatario != "98765432000188" {
		t.Errorf("Expected cnpj_destinatario=98765432000188, got %v", p.CnpjDestinatario)
	}
	if len(p.Items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(p.Items))
	}
	
	// Verify flat totals at root
	if p.ValorTotal == nil || *p.ValorTotal != 1180.00 {
		t.Errorf("Expected valor_total=1180.00, got %v", p.ValorTotal)
	}
	if p.IcmsBaseCalculo == nil || *p.IcmsBaseCalculo != 1000.00 {
		t.Errorf("Expected icms_base_calculo=1000.00, got %v", p.IcmsBaseCalculo)
	}
	
	// Verify flat transport
	if p.ModalidadeFrete == nil || *p.ModalidadeFrete != "0" {
		t.Errorf("Expected modalidade_frete=0, got %v", p.ModalidadeFrete)
	}
	if p.NomeTransportador == nil || *p.NomeTransportador != "TRANSPORTADORA XYZ LTDA" {
		t.Errorf("Expected nome_transportador=TRANSPORTADORA XYZ LTDA, got %v", p.NomeTransportador)
	}
	
	// Verify flat invoice
	if p.NumeroFatura == nil || *p.NumeroFatura != "FAT-001" {
		t.Errorf("Expected numero_fatura=FAT-001, got %v", p.NumeroFatura)
	}
	
	// Verify item with codigo_produto
	item := p.Items[0]
	if item.CodigoProduto == nil || *item.CodigoProduto != "PROD-001" {
		t.Errorf("Expected item.codigo_produto=PROD-001, got %v", item.CodigoProduto)
	}
	if item.ValorUnitarioComercial == nil || item.ValorUnitarioComercial.Value != 100.0 {
		t.Errorf("Expected item.valor_unitario_comercial=100.0, got %v", item.ValorUnitarioComercial)
	}
}

func TestParseSAPNFePayload_InvalidJSON(t *testing.T) {
	_, err := ParseSAPNFePayload([]byte(`{invalid json`))
	if err == nil {
		t.Error("Expected error for invalid JSON")
	}
}

func TestParseSAPNFePayload_ABAPUppercaseStringQuantities(t *testing.T) {
	raw := `{
	  "NATUREZA_OPERACAO":"Venda",
	  "SERIE":"2",
	  "NUMERO":"000069342",
	  "CNPJ_EMITENTE":"13677964000200",
	  "ITEMS":[{
	    "NUMERO_ITEM":1,
	    "CODIGO_PRODUTO":"19001930",
	    "DESCRICAO":"TRATOR",
	    "CODIGO_NCM":"87019300",
	    "CFOP":"6101",
	    "UNIDADE_COMERCIAL":"UN",
	    "QUANTIDADE_COMERCIAL":1.0,
	    "VALOR_UNITARIO_COMERCIAL":"194408.8300000000 ",
	    "VALOR_BRUTO":194408.83,
	    "RASTROS":[{"NUMERO_LOTE":"2063010011","QUANTIDADE_LOTE":"1.000 "}],
	    "ICMS_SITUACAO_TRIBUTARIA":"00",
	    "ICMS_BASE_CALCULO":199111.83,
	    "PIS_SITUACAO_TRIBUTARIA":"02",
	    "PIS_ALIQUOTA_PORCENTUAL":2.0
	  }],
	  "VOLUMES":[{"QUANTIDADE":"000000000000001","ESPECIE":"UN","PESO_LIQUIDO":3320.0,"PESO_BRUTO":3320.0}],
	  "INSCRICAO_ESTADUAL_DEST":"4813864440020"
	}`
	p, normalized, err := ParseSAPNFePayloadNormalized([]byte(raw))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if p.CnpjEmitente == nil || *p.CnpjEmitente != "13677964000200" {
		t.Fatalf("cnpj_emitente=%v", p.CnpjEmitente)
	}
	if p.InscricaoEstadualDestinatario == nil || *p.InscricaoEstadualDestinatario != "4813864440020" {
		t.Fatalf("IE dest alias=%v", p.InscricaoEstadualDestinatario)
	}
	if len(p.Items) != 1 {
		t.Fatalf("items=%d", len(p.Items))
	}
	item := p.Items[0]
	if item.ValorUnitarioComercial == nil || item.ValorUnitarioComercial.Value != 194408.83 {
		t.Fatalf("vUnCom=%v", item.ValorUnitarioComercial)
	}
	if len(item.Rastros) != 1 || item.Rastros[0].QuantidadeLote == nil || item.Rastros[0].QuantidadeLote.Value != 1 {
		t.Fatalf("rastro qty=%v", item.Rastros)
	}
	if item.IcmsCst == nil || *item.IcmsCst != "00" {
		t.Fatalf("icms_cst alias=%v", item.IcmsCst)
	}
	if item.IcmsBase == nil || *item.IcmsBase != 199111.83 {
		t.Fatalf("icms_base alias=%v", item.IcmsBase)
	}
	if item.PisCst == nil || *item.PisCst != "02" {
		t.Fatalf("pis_cst alias=%v", item.PisCst)
	}
	if item.PisAliquota == nil || *item.PisAliquota != 2 {
		t.Fatalf("pis_aliquota alias=%v", item.PisAliquota)
	}
	if len(p.Volumes) != 1 || p.Volumes[0].Quantidade == nil || p.Volumes[0].Quantidade.Value != 1 {
		t.Fatalf("volume qty=%v", p.Volumes)
	}
	var check map[string]any
	if err := json.Unmarshal(normalized, &check); err != nil {
		t.Fatalf("normalized json: %v", err)
	}
	if _, ok := check["cnpj_emitente"]; !ok {
		t.Fatalf("normalized missing lowercase cnpj_emitente: %v", check)
	}
}

func TestNormalizeSAPNFeJSON_CEPDigits(t *testing.T) {
	raw := `{"CEP_EMITENTE":"89248-000","CEP_DESTINATARIO":"38743-110","CNPJ_EMITENTE":"13677964000200","SERIE":"1","NUMERO":"1"}`
	out, err := NormalizeSAPNFeJSON([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	if m["cep_emitente"] != "89248000" {
		t.Fatalf("cep_emitente=%v", m["cep_emitente"])
	}
	if m["cep_destinatario"] != "38743110" {
		t.Fatalf("cep_destinatario=%v", m["cep_destinatario"])
	}
}

func TestValidateSAPNFeOutbound(t *testing.T) {
	tests := []struct {
		name    string
		payload *SAPNFePayload
		wantErr string
	}{
		{
			name: "valid payload",
			payload: &SAPNFePayload{
				Serie:             strPtr("1"),
				Numero:            strPtr("12345"),
				CnpjEmitente:      strPtr("12345678000195"),
				CnpjDestinatario:  strPtr("98765432000188"),
				Items:             []SAPItem{{}},
			},
			wantErr: "",
		},
		{
			name: "missing issuer",
			payload: &SAPNFePayload{
				Serie:            strPtr("1"),
				Numero:           strPtr("12345"),
				CnpjDestinatario: strPtr("98765432000188"),
				Items:            []SAPItem{{}},
			},
			wantErr: "missing_issuer",
		},
		{
			name: "missing series",
			payload: &SAPNFePayload{
				Numero:           strPtr("12345"),
				CnpjEmitente:     strPtr("12345678000195"),
				CnpjDestinatario: strPtr("98765432000188"),
				Items:            []SAPItem{{}},
			},
			wantErr: "missing_series",
		},
		{
			name: "missing number",
			payload: &SAPNFePayload{
				Serie:            strPtr("1"),
				CnpjEmitente:     strPtr("12345678000195"),
				CnpjDestinatario: strPtr("98765432000188"),
				Items:            []SAPItem{{}},
			},
			wantErr: "missing_number",
		},
		{
			name: "missing items",
			payload: &SAPNFePayload{
				Serie:            strPtr("1"),
				Numero:           strPtr("12345"),
				CnpjEmitente:     strPtr("12345678000195"),
				CnpjDestinatario: strPtr("98765432000188"),
				Items:            []SAPItem{},
			},
			wantErr: "missing_items",
		},
		{
			name: "missing recipient",
			payload: &SAPNFePayload{
				Serie:        strPtr("1"),
				Numero:       strPtr("12345"),
				CnpjEmitente: strPtr("12345678000195"),
				Items:        []SAPItem{{}},
			},
			wantErr: "missing_recipient",
		},
		{
			name: "recipient cpf is valid",
			payload: &SAPNFePayload{
				Serie:           strPtr("1"),
				Numero:          strPtr("12345"),
				CnpjEmitente:    strPtr("12345678000195"),
				CpfDestinatario: strPtr("12345678901"),
				Items:           []SAPItem{{}},
			},
			wantErr: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateSAPNFeOutbound(tt.payload)
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
			} else {
				if err == nil {
					t.Errorf("Expected error with code %s, got nil", tt.wantErr)
				} else if !containsCode(err, tt.wantErr) {
					t.Errorf("Expected error code %s, got %v", tt.wantErr, err)
				}
			}
		})
	}
}

func TestSAPFlatFieldMapping(t *testing.T) {
	// Table-driven test to verify the flat SAP JSON contract
	tests := []struct {
		name     string
		json     string
		validate func(*SAPNFePayload) error
	}{
		{
			name: "IDE fields flat at root",
			json: `{"natureza_operacao":"VENDA","tipo_documento":"1","serie":"1","numero":"123"}`,
			validate: func(p *SAPNFePayload) error {
				if p.NaturezaOperacao == nil || *p.NaturezaOperacao != "VENDA" {
					t.Error("natureza_operacao not mapped")
				}
				if p.TipoDocumento == nil || *p.TipoDocumento != "1" {
					t.Error("tipo_documento not mapped")
				}
				return nil
			},
		},
		{
			name: "Issuer flat with _emitente suffix",
			json: `{"nome_emitente":"TEST LTDA","cnpj_emitente":"12345678000195","inscricao_estadual_emitente":"123456"}`,
			validate: func(p *SAPNFePayload) error {
				if p.NomeEmitente == nil || *p.NomeEmitente != "TEST LTDA" {
					t.Error("nome_emitente not mapped")
				}
				if p.CnpjEmitente == nil || *p.CnpjEmitente != "12345678000195" {
					t.Error("cnpj_emitente not mapped")
				}
				if p.InscricaoEstadualEmitente == nil || *p.InscricaoEstadualEmitente != "123456" {
					t.Error("inscricao_estadual_emitente not mapped")
				}
				return nil
			},
		},
		{
			name: "Totals flat at root",
			json: `{"valor_total":1000.50,"icms_base_calculo":800.00,"valor_produtos":900.00}`,
			validate: func(p *SAPNFePayload) error {
				if p.ValorTotal == nil || *p.ValorTotal != 1000.50 {
					t.Error("valor_total not mapped")
				}
				if p.IcmsBaseCalculo == nil || *p.IcmsBaseCalculo != 800.00 {
					t.Error("icms_base_calculo not mapped")
				}
				if p.ValorProdutos == nil || *p.ValorProdutos != 900.00 {
					t.Error("valor_produtos not mapped")
				}
				return nil
			},
		},
		{
			name: "Transport flat at root",
			json: `{"modalidade_frete":"0","nome_transportador":"TRANS LTDA","cnpj_transportador":"11111111000111"}`,
			validate: func(p *SAPNFePayload) error {
				if p.ModalidadeFrete == nil || *p.ModalidadeFrete != "0" {
					t.Error("modalidade_frete not mapped")
				}
				if p.NomeTransportador == nil || *p.NomeTransportador != "TRANS LTDA" {
					t.Error("nome_transportador not mapped")
				}
				return nil
			},
		},
		{
			name: "Invoice flat at root",
			json: `{"numero_fatura":"FAT-001","valor_liquido_fatura":500.00}`,
			validate: func(p *SAPNFePayload) error {
				if p.NumeroFatura == nil || *p.NumeroFatura != "FAT-001" {
					t.Error("numero_fatura not mapped")
				}
				if p.ValorLiquidoFatura == nil || *p.ValorLiquidoFatura != 500.00 {
					t.Error("valor_liquido_fatura not mapped")
				}
				return nil
			},
		},
		{
			name: "Items array with flat item fields",
			json: `{"items":[{"codigo_produto":"ABC","descricao":"TEST","valor_bruto":100.00,"cfop":"5102"}]}`,
			validate: func(p *SAPNFePayload) error {
				if len(p.Items) != 1 {
					t.Error("items array not mapped")
				}
				if p.Items[0].CodigoProduto == nil || *p.Items[0].CodigoProduto != "ABC" {
					t.Error("item.codigo_produto not mapped")
				}
				if p.Items[0].Descricao == nil || *p.Items[0].Descricao != "TEST" {
					t.Error("item.descricao not mapped")
				}
				return nil
			},
		},
		{
			name: "Item valor_unitario_comercial as string",
			json: `{"items":[{"codigo_produto":"X","valor_unitario_comercial":"100.0000000"}]}`,
			validate: func(p *SAPNFePayload) error {
				if len(p.Items) != 1 {
					t.Error("items array not mapped")
				}
				if p.Items[0].ValorUnitarioComercial == nil || p.Items[0].ValorUnitarioComercial.Value != 100.0 {
					t.Errorf("item.valor_unitario_comercial not parsed from string, got %v", p.Items[0].ValorUnitarioComercial)
				}
				return nil
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, err := ParseSAPNFePayload([]byte(tt.json))
			if err != nil {
				t.Fatalf("Parse error: %v", err)
			}
			if err := tt.validate(p); err != nil {
				t.Error(err)
			}
		})
	}
}

// Helper functions
func strPtr(s string) *string {
	return &s
}

func containsCode(err error, code string) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return msg != "" && (msg == code || len(msg) > len(code) && msg[:len(code)] == code)
}
