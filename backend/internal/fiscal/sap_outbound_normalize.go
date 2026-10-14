package fiscal

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// SAP ABAP often truncates long field names. Map short → canonical contract names.
var sapRootFieldAliases = map[string]string{
	"inscricao_estadual_dest":              "inscricao_estadual_destinatario",
	"indicador_inscricao_est_dest":         "indicador_inscricao_estadual_destinatario",
	"inscricao_municipal_dest":             "inscricao_municipal_destinatario",
	"informacoes_adicionais_contrib":       "informacoes_adicionais_contribuinte",
	"inscricao_estadual_transp":            "inscricao_estadual_transportador",
	"ibs_cbs_municipio":                    "codigo_municipio_fato_gerador_ibs",
	"tipo_nota_debito":                     "tp_nf_debito",
	"tipo_nota_credito":                    "tp_nf_credito",
	"codigo_indicador_operacao_forn":       "codigo_indicador_operacao_fornecimento",
	"chaves_nfe_antecipacao_pag":           "chaves_nfe_antecipacao_pagamento",
	"cana_mes_ano_referencia":              "cana_mes_ano_ref",
	"transporte_icms_codigo_munic":         "transporte_icms_codigo_municipio",
}

var sapCEPFields = map[string]struct{}{
	"cep_emitente":     {},
	"cep_destinatario": {},
	"cep_retirada":     {},
	"cep_entrega":      {},
}

// CNPJ fields often arrive as JSON numbers and lose leading zeros (SEFAZ cStat 215 / TCnpj).
var sapCNPJFields = map[string]struct{}{
	"cnpj_emitente":       {},
	"cnpj_destinatario":   {},
	"cnpj_intermediario":  {},
	"cnpj_transportador":  {},
	"cnpj":                {}, // pessoas_autorizadas[] / nested
	"cnpj_exportador":     {},
	"cnpj_fabricante":     {},
}

var sapCPFFields = map[string]struct{}{
	"cpf_emitente":      {},
	"cpf_destinatario":  {},
	"cpf":               {},
	"cpf_transportador": {},
}

var sapItemFieldAliases = map[string]string{
	"icms_situacao_tributaria":       "icms_cst",
	"icms_modalidade_base_calculo":   "icms_modalidade",
	"icms_base_calculo":              "icms_base",
	"icms_valor_desonerado":          "icms_valor_desoneracao",
	"icms_mod_base_calculo_st":       "icms_st_modalidade",
	"icms_margem_valor_adic_st":      "icms_st_mva_aliquota",
	"icms_reducao_base_calculo_st":   "icms_st_reducao_percent",
	"icms_base_calculo_st":           "icms_st_base",
	"icms_aliquota_st":               "icms_st_aliquota",
	"icms_valor_st":                  "icms_st_valor",
	"fcp_percentual_st":              "icms_st_fcp_aliquota",
	"fcp_valor_st":                   "icms_st_fcp_valor",
	"fcp_percentual":                 "icms_fcp_aliquota",
	"fcp_valor":                      "icms_fcp_valor",
	"ipi_situacao_tributaria":        "ipi_cst",
	"ipi_base_calculo":               "ipi_base",
	"ipi_codigo_enquadramento_legal": "ipi_enquadramento",
	"pis_situacao_tributaria":        "pis_cst",
	"pis_base_calculo":               "pis_base",
	"pis_aliquota_porcentual":        "pis_aliquota",
	"cofins_situacao_tributaria":     "cofins_cst",
	"cofins_base_calculo":            "cofins_base",
	"cofins_aliquota_porcentual":     "cofins_aliquota",
	"ibs_cbs_situacao_tributaria":    "ibs_cst",
	"ibs_cbs_classificacao_tribut":   "ibs_c_class_trib",
	"ibs_cbs_base_calculo":           "ibs_base",
	"ibs_valor_total":                "ibs_valor",
	"ibs_uf_aliquota":                "ibs_aliquota_uf",
	"ibs_uf_valor":                   "ibs_valor_uf",
	"ibs_mun_aliquota":               "ibs_aliquota_mun",
	"ibs_mun_valor":                  "ibs_valor_mun",
	"codigo_beneficio_fiscal":        "cbenef",
	"ind_total":                      "inclui_no_total",
}

// NormalizeSAPNFeJSON lowercases object keys and rewrites known ABAP truncated
// aliases so both the Go parser and nfe-gateway mapper see the canonical contract.
func NormalizeSAPNFeJSON(payload []byte) ([]byte, error) {
	var root any
	if err := json.Unmarshal(payload, &root); err != nil {
		return nil, err
	}
	normalized := normalizeSAPValue(root, sapRootFieldAliases)
	if m, ok := normalized.(map[string]any); ok {
		if items, ok := m["items"].([]any); ok {
			for i, item := range items {
				items[i] = normalizeSAPValue(item, sapItemFieldAliases)
			}
			m["items"] = items
		}
		// Mirror IBS classification onto CBS when only the shared SAP field exists.
		if items, ok := m["items"].([]any); ok {
			for _, raw := range items {
				item, ok := raw.(map[string]any)
				if !ok {
					continue
				}
				if _, has := item["cbs_cst"]; !has {
					if v, ok := item["ibs_cst"]; ok {
						item["cbs_cst"] = v
					}
				}
				if _, has := item["cbs_c_class_trib"]; !has {
					if v, ok := item["ibs_c_class_trib"]; ok {
						item["cbs_c_class_trib"] = v
					}
				}
				if _, has := item["cbs_base"]; !has {
					if v, ok := item["ibs_base"]; ok {
						item["cbs_base"] = v
					}
				}
			}
		}
		fillKnownMunicipalityCodes(m)
		normalized = m
	}
	return json.Marshal(normalized)
}

// Known plant city→IBGE when ABAP omits codigo_municipio_emitente / cMunFG.
var sapKnownMunicipalityIBGE = map[string]string{
	"GARUVA|SC": "4205803",
}

func fillKnownMunicipalityCodes(m map[string]any) {
	city, _ := m["municipio_emitente"].(string)
	uf, _ := m["uf_emitente"].(string)
	key := strings.ToUpper(strings.TrimSpace(city)) + "|" + strings.ToUpper(strings.TrimSpace(uf))
	code, ok := sapKnownMunicipalityIBGE[key]
	if !ok {
		return
	}
	// Always set for known plants — corrects a previously persisted wrong IBGE
	// (e.g. Garuva was briefly filled as Gaspar 4205906).
	m["codigo_municipio_emitente"] = code
	m["codigo_municipio_fato_gerador"] = code
}

func isBlankAny(v any) bool {
	if v == nil {
		return true
	}
	s, ok := v.(string)
	return ok && strings.TrimSpace(s) == ""
}

func normalizeSAPValue(v any, aliases map[string]string) any {
	switch typed := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for k, child := range typed {
			key := strings.ToLower(strings.TrimSpace(k))
			if alias, ok := aliases[key]; ok {
				key = alias
			}
			normalizedChild := normalizeSAPValue(child, aliases)
			if _, isCEP := sapCEPFields[key]; isCEP {
				normalizedChild = digitsOnlyAny(normalizedChild)
			}
			if _, isCNPJ := sapCNPJFields[key]; isCNPJ {
				normalizedChild = normalizeCNPJAny(normalizedChild)
			}
			if _, isCPF := sapCPFFields[key]; isCPF {
				normalizedChild = padDigitsAny(normalizedChild, 11)
			}
			out[key] = normalizedChild
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			out[i] = normalizeSAPValue(child, aliases)
		}
		return out
	default:
		return v
	}
}

func digitsOnlyAny(v any) any {
	switch typed := v.(type) {
	case string:
		d := digitsOnly(typed)
		if d == "" {
			return nil
		}
		if len(d) > 8 {
			d = d[:8]
		}
		return d
	default:
		return v
	}
}

func padDigitsAny(v any, width int) any {
	var raw string
	switch typed := v.(type) {
	case string:
		raw = typed
	case float64:
		// JSON numbers: avoid scientific notation; CNPJ/CPF fit in int64.
		raw = strconv.FormatInt(int64(typed), 10)
	case json.Number:
		raw = typed.String()
	default:
		raw = fmt.Sprint(v)
	}
	d := digitsOnly(raw)
	if d == "" {
		return nil
	}
	if len(d) > width {
		return d
	}
	return padLeft(d, width, '0')
}

// normalizeCNPJAny preserves NT 2026.004 alphanumeric CNPJ (A-Z0-9).
// Pure numeric values still get leading-zero padding for SAP JSON numbers.
func normalizeCNPJAny(v any) any {
	var raw string
	switch typed := v.(type) {
	case string:
		raw = typed
	case float64:
		raw = strconv.FormatInt(int64(typed), 10)
	case json.Number:
		raw = typed.String()
	default:
		raw = fmt.Sprint(v)
	}
	hasAlpha := false
	for _, r := range raw {
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
			hasAlpha = true
			break
		}
	}
	if hasAlpha {
		var b strings.Builder
		for _, r := range strings.ToUpper(raw) {
			if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
				b.WriteRune(r)
			}
		}
		s := b.String()
		if s == "" {
			return nil
		}
		return s
	}
	return padDigitsAny(raw, 14)
}

func padLeft(s string, width int, pad byte) string {
	if len(s) >= width {
		return s
	}
	buf := make([]byte, width)
	for i := 0; i < width-len(s); i++ {
		buf[i] = pad
	}
	copy(buf[width-len(s):], s)
	return string(buf)
}
