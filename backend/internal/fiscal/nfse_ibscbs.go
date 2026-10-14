package fiscal

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/organization"
)

// Reforma tributária na NFS-e Nacional.
//
// Entrada: quando o SAP não envia CST / cClassTrib / cIndOp do IBS/CBS, o
// backend completa o payload com os padrões cadastrados no serviço da empresa
// (catálogo NFS-e) antes de entregar ao nfe-gateway. Sem esses campos a DPS
// não leva o grupo IBSCBS e a SEFIN não calcula IBS/CBS.
//
// Saída: NFSeIBSCBSResult é o grupo infNFSe/IBSCBS que a SEFIN devolve na
// NFS-e autorizada, normalizado pelo gateway (nfse/retorno.py).

// NFSeIBSCBSResult mirrors nfe_gateway.nfse.retorno.extract_ibscbs. Decimal
// values are strings exactly as printed by the SEFIN (rates in percent).
type NFSeIBSCBSResult struct {
	CST                       string `json:"cst,omitempty"`
	ClassTrib                 string `json:"c_class_trib,omitempty"`
	OperationIndicator        string `json:"c_ind_op,omitempty"`
	IncidenceMunicipality     string `json:"c_localidade_incid,omitempty"`
	IncidenceMunicipalityName string `json:"x_localidade_incid,omitempty"`
	BaseCalculo               string `json:"v_bc,omitempty"`
	IBSUFRate                 string `json:"p_ibs_uf,omitempty"`
	IBSUFRateReduction        string `json:"p_red_aliq_uf,omitempty"`
	IBSUFEffectiveRate        string `json:"p_aliq_efet_uf,omitempty"`
	IBSMunRate                string `json:"p_ibs_mun,omitempty"`
	IBSMunRateReduction       string `json:"p_red_aliq_mun,omitempty"`
	IBSMunEffectiveRate       string `json:"p_aliq_efet_mun,omitempty"`
	CBSRate                   string `json:"p_cbs,omitempty"`
	CBSRateReduction          string `json:"p_red_aliq_cbs,omitempty"`
	CBSEffectiveRate          string `json:"p_aliq_efet_cbs,omitempty"`
	IBSUFAmount               string `json:"v_ibs_uf,omitempty"`
	IBSMunAmount              string `json:"v_ibs_mun,omitempty"`
	IBSAmount                 string `json:"v_ibs,omitempty"`
	CBSAmount                 string `json:"v_cbs,omitempty"`
	TotalWithIBSCBS           string `json:"v_tot_nf,omitempty"`
}

// Empty reports whether the SEFIN returned no IBS/CBS values at all.
func (r *NFSeIBSCBSResult) Empty() bool {
	if r == nil {
		return true
	}
	return r.BaseCalculo == "" && r.IBSUFAmount == "" && r.IBSMunAmount == "" &&
		r.IBSAmount == "" && r.CBSAmount == "" && r.TotalWithIBSCBS == ""
}

// WebhookMap is the ibs_cbs object added to the transmission outbox event.
func (r *NFSeIBSCBSResult) WebhookMap() map[string]any {
	out := map[string]any{"fonte": "sefin"}
	add := func(k, v string) {
		if strings.TrimSpace(v) != "" {
			out[k] = strings.TrimSpace(v)
		}
	}
	add("cst", r.CST)
	add("c_class_trib", r.ClassTrib)
	add("c_ind_op", r.OperationIndicator)
	add("codigo_municipio_incidencia", r.IncidenceMunicipality)
	add("municipio_incidencia", r.IncidenceMunicipalityName)
	add("base_calculo", r.BaseCalculo)
	add("ibs_uf_aliquota", r.IBSUFRate)
	add("ibs_uf_aliquota_efetiva", r.IBSUFEffectiveRate)
	add("ibs_uf_reducao_aliquota", r.IBSUFRateReduction)
	add("ibs_uf_valor", r.IBSUFAmount)
	add("ibs_mun_aliquota", r.IBSMunRate)
	add("ibs_mun_aliquota_efetiva", r.IBSMunEffectiveRate)
	add("ibs_mun_reducao_aliquota", r.IBSMunRateReduction)
	add("ibs_mun_valor", r.IBSMunAmount)
	add("ibs_valor", r.IBSAmount)
	add("cbs_aliquota", r.CBSRate)
	add("cbs_aliquota_efetiva", r.CBSEffectiveRate)
	add("cbs_reducao_aliquota", r.CBSRateReduction)
	add("cbs_valor", r.CBSAmount)
	add("valor_total_com_ibs_cbs", r.TotalWithIBSCBS)
	return out
}

// applyNFSeIBSCBSDefaults completes an outbound SAP NFS-e with the IBS/CBS
// defaults of the matching catalog service. Fields SAP sent always win.
// Returns the (possibly rewritten) payload and the names of the filled fields.
func (s *Service) applyNFSeIBSCBSDefaults(ctx context.Context, organizationID, companyID uuid.UUID, p *SAPNFSePayload, payload []byte) ([]byte, []string, error) {
	if s.orgs == nil || p == nil {
		return payload, nil, nil
	}
	needClass := derefStr(p.Servico.IbsCbsSituacaoTributaria) == "" && p.Servico.ClassificacaoTributaria() == ""
	needIndOp := derefStr(p.Servico.CodigoIndicadorOperacao) == ""
	if !needClass && !needIndOp {
		return payload, nil, nil
	}
	defaults, err := s.orgs.FindNFSeIBSCBSDefaults(ctx, organizationID, companyID,
		derefStr(p.Servico.ItemListaServico), derefStr(p.Servico.CodigoNBS))
	if err != nil || defaults == nil {
		return payload, nil, err
	}
	return enrichNFSePayloadIBSCBS(p, payload, *defaults, needClass, needIndOp)
}

func enrichNFSePayloadIBSCBS(p *SAPNFSePayload, payload []byte, d organization.NFSeIBSCBSDefaults, needClass, needIndOp bool) ([]byte, []string, error) {
	fill := map[string]string{}
	if needClass && d.CST != "" && d.ClassTrib != "" {
		fill["ibs_cbs_situacao_tributaria"] = d.CST
		fill["ibs_cbs_classificacao_tributaria"] = d.ClassTrib
	}
	if needIndOp && d.OperationIndicator != "" {
		fill["codigo_indicador_operacao"] = d.OperationIndicator
	}
	if len(fill) == 0 {
		return payload, nil, nil
	}

	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.UseNumber() // keep SAP amounts byte-for-byte (no float re-rounding)
	var root map[string]any
	if err := dec.Decode(&root); err != nil {
		return payload, nil, err
	}
	servico, _ := root["servico"].(map[string]any)
	if servico == nil {
		servico = map[string]any{}
		root["servico"] = servico
	}
	var filled []string
	for _, key := range []string{"ibs_cbs_situacao_tributaria", "ibs_cbs_classificacao_tributaria", "codigo_indicador_operacao"} {
		v, ok := fill[key]
		if !ok {
			continue
		}
		servico[key] = v
		filled = append(filled, key)
	}
	out, err := json.Marshal(root)
	if err != nil {
		return payload, nil, err
	}

	if v, ok := fill["ibs_cbs_situacao_tributaria"]; ok {
		cst := v
		p.Servico.IbsCbsSituacaoTributaria = &cst
	}
	if v, ok := fill["ibs_cbs_classificacao_tributaria"]; ok {
		class := v
		p.Servico.IbsCbsClassificacaoTributaria = &class
	}
	if v, ok := fill["codigo_indicador_operacao"]; ok {
		indOp := v
		p.Servico.CodigoIndicadorOperacao = &indOp
	}
	return out, filled, nil
}

// persistNFSeIBSCBSResultTx stores the SEFIN-calculated IBS/CBS on
// organization_nfse. Amounts and base overwrite what SAP sent (the SEFIN
// value is the legal one); rates go to the *_pct columns (percent, as
// printed by the SEFIN) so they never mix with the SAP rate columns.
func persistNFSeIBSCBSResultTx(ctx context.Context, tx pgx.Tx, doc Document, r *NFSeIBSCBSResult, now time.Time) error {
	raw, err := json.Marshal(r)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		update organization_nfse set
			ibs_cbs_tax_situation = coalesce(nullif($3, ''), ibs_cbs_tax_situation),
			ibs_cbs_tax_classification = coalesce(nullif($4, ''), ibs_cbs_tax_classification),
			ibs_cbs_operation_indicator = coalesce(nullif($5, ''), ibs_cbs_operation_indicator),
			ibs_cbs_incidence_municipality_code = nullif($6, ''),
			ibs_cbs_incidence_municipality_name = nullif($7, ''),
			ibs_cbs_calculation_base = coalesce(nullif($8, '')::numeric, ibs_cbs_calculation_base),
			ibs_uf_rate_pct = nullif($9, '')::numeric,
			ibs_uf_effective_rate_pct = nullif($10, '')::numeric,
			ibs_mun_rate_pct = nullif($11, '')::numeric,
			ibs_mun_effective_rate_pct = nullif($12, '')::numeric,
			cbs_rate_pct = nullif($13, '')::numeric,
			cbs_effective_rate_pct = nullif($14, '')::numeric,
			ibs_uf_amount = coalesce(nullif($15, '')::numeric, ibs_uf_amount),
			ibs_mun_amount = coalesce(nullif($16, '')::numeric, ibs_mun_amount),
			ibs_amount = nullif($17, '')::numeric,
			cbs_amount = coalesce(nullif($18, '')::numeric, cbs_amount),
			total_with_ibs_cbs = nullif($19, '')::numeric,
			ibs_cbs_source = 'sefin',
			ibs_cbs_calculated_at = $20,
			ibs_cbs_sefin_json = $21
		where organization_document_id = $1 and organization_id = $2
	`, doc.ID, doc.OrganizationID,
		numericOrEmpty(r.CST, false), numericOrEmpty(r.ClassTrib, false), numericOrEmpty(r.OperationIndicator, false),
		numericOrEmpty(r.IncidenceMunicipality, false), strings.TrimSpace(r.IncidenceMunicipalityName),
		numericOrEmpty(r.BaseCalculo, true),
		numericOrEmpty(r.IBSUFRate, true), numericOrEmpty(r.IBSUFEffectiveRate, true),
		numericOrEmpty(r.IBSMunRate, true), numericOrEmpty(r.IBSMunEffectiveRate, true),
		numericOrEmpty(r.CBSRate, true), numericOrEmpty(r.CBSEffectiveRate, true),
		numericOrEmpty(r.IBSUFAmount, true), numericOrEmpty(r.IBSMunAmount, true),
		numericOrEmpty(r.IBSAmount, true), numericOrEmpty(r.CBSAmount, true),
		numericOrEmpty(r.TotalWithIBSCBS, true), now, raw)
	return err
}

// numericOrEmpty keeps only well-formed values: decimals ("0.50", "-1.2")
// when decimal is true, digit-only codes otherwise. Anything else becomes ""
// so a malformed SEFIN field never aborts the authorization transaction.
func numericOrEmpty(v string, decimal bool) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	dot := false
	for i, r := range v {
		switch {
		case r >= '0' && r <= '9':
		case decimal && r == '.' && !dot:
			dot = true
		case decimal && r == '-' && i == 0:
		default:
			return ""
		}
	}
	return v
}
