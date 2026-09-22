package fiscal

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// persistOutboundNFSe persists the full SAP outbound NFS-e payload into the
// relational schema from migration 037. Must be called within a transaction
// after the base organization_nfse insert.
func (s *Service) persistOutboundNFSe(
	ctx context.Context,
	tx pgx.Tx,
	organizationID, documentID uuid.UUID,
	p *SAPNFSePayload,
) error {
	var end *SAPNFSeEndereco
	if p.Tomador.Endereco != nil {
		end = p.Tomador.Endereco
	} else {
		end = &SAPNFSeEndereco{}
	}

	var interm SAPNFSeIntermediario
	if p.Intermediario != nil {
		interm = *p.Intermediario
	}

	optante := boolPtrFromFlexible(p.OptanteSimplesNacional)
	cultural := boolPtrFromFlexible(p.IncentivadorCultural)
	issRetido := boolPtrFromFlexible(p.Servico.ISSRetido)
	classTrib := p.Servico.ClassificacaoTributaria()
	munTaxCode := p.Servico.CodigoTributario()
	// municipality_code is text (001); provider/service codes are char(7) (037).
	// Reusing $24/$48 in both assignments makes Postgres raise 42P08
	// (inconsistent types deduced for parameter).
	headerMunicipality := derefStr(p.Prestador.CodigoMunicipio)
	if headerMunicipality == "" {
		headerMunicipality = derefStr(p.Servico.CodigoMunicipio)
	}

	_, err := tx.Exec(ctx, `
		UPDATE organization_nfse SET
			nature_of_operation = $3,
			special_tax_regime = $4,
			optante_simples_nacional = $5,
			cultural_incentive = $6,
			emission_date = $7,
			rps_number = coalesce(nullif($8, ''), rps_number),
			rps_series = coalesce(nullif($9, ''), rps_series),
			work_code = $10,
			art_code = $11,
			substituted_nfse_number = $12,
			substituted_rps_number = $13,
			substituted_rps_series = $14,
			substituted_rps_type = $15,
			substituted_access_key = coalesce(nullif($100, ''), substituted_access_key),
			recipient_indicator = $16,
			consumer_final = $17,
			emission_purpose = $18,
			federal_tax_percent = $19,
			state_tax_percent = $20,
			municipal_tax_percent = $21,

			provider_cnpj = $22,
			provider_im = $23,
			provider_municipality_code = $24,
			municipality_code = coalesce(nullif($99, ''), municipality_code),

			taker_cpf = $25,
			taker_cnpj = $26,
			taker_nif = $27,
			taker_nif_absence_reason = $28,
			taker_im = $29,
			taker_legal_name = $30,
			taker_phone = $31,
			taker_email = $32,
			taker_street = $33,
			taker_street_type = $34,
			taker_number = $35,
			taker_complement = $36,
			taker_district = $37,
			taker_municipality_code = $38,
			taker_uf = $39,
			taker_cep = $40,
			taker_foreign_country_code = $41,
			taker_foreign_cep = $42,
			taker_foreign_city = $43,
			taker_foreign_region = $44,

			intermediary_legal_name = $45,
			intermediary_cpf = $46,
			intermediary_cnpj = $47,
			intermediary_nif = $49,
			intermediary_nif_absence_reason = $50,
			intermediary_im = $51,
			intermediary_municipality_code = $52,

			service_amount = $53,
			deductions_amount = $54,
			pis_amount = $55,
			cofins_amount = $56,
			inss_amount = $57,
			ir_amount = $58,
			csll_amount = $59,
			iss_withheld = $60,
			iss_amount = $61,
			iss_withheld_amount = $62,
			other_withholdings = $63,
			calculation_base = $64,
			iss_rate = $65,
			unconditional_discount = $66,
			conditional_discount = $67,
			service_list_item = $68,
			cnae_code = $69,
			municipal_tax_code = $70,
			discrimination = $71,
			service_municipality_code = $48,
			total_taxes_percent = $72,
			total_taxes_source = $73,

			nbs_code = $74,
			operation_indicator_code = $75,
			ibs_cbs_tax_situation = $76,
			ibs_cbs_tax_classification = $77,
			ibs_cbs_calculation_base = $78,
			ibs_uf_rate = $79,
			ibs_mun_rate = $80,
			cbs_rate = $81,
			ibs_uf_amount = $82,
			ibs_mun_amount = $83,
			cbs_amount = $84,
			incidence_municipality_code = $85,
			pis_cofins_tax_situation = $86,
			pis_cofins_calculation_base = $87,
			pis_rate = $88,
			cofins_rate = $89,
			pis_cofins_withholding_type = $90,
			public_roads_flag = $91,
			service_street = $92,
			service_number = $93,
			service_complement = $94,
			service_district = $95,
			service_city_name = $96,
			service_uf = $97,
			service_cep = $98,
			issued_at = coalesce($7, issued_at),
			metadata_json = coalesce(metadata_json, '{}'::jsonb) || $101::jsonb
		WHERE organization_document_id = $1 AND organization_id = $2
	`,
		documentID, organizationID,
		p.NaturezaOperacao, p.RegimeEspecialTributacao, optante, cultural,
		parseRFC3339(p.DataEmissao),
		derefStr(p.NumeroRPS), derefStr(p.SerieRPS),
		p.CodigoObra, p.ART,
		p.NumeroNFSeSubstituido, p.NumeroRPSSubstituido, p.SerieRPSSubstituido, p.TipoRPSSubstituido,
		p.IndicadorDestinatario, p.ConsumidorFinal, p.FinalidadeEmissao,
		p.PercentualTotalTributosFed, p.PercentualTotalTributosEst, p.PercentualTotalTributosMun,
		p.Prestador.CNPJ, p.Prestador.InscricaoMunicipal, p.Prestador.CodigoMunicipio,
		p.Tomador.CPF, p.Tomador.CNPJ, p.Tomador.NIF, p.Tomador.MotivoAusenciaNIF,
		p.Tomador.InscricaoMunicipal, p.Tomador.RazaoSocial, p.Tomador.Telefone, p.Tomador.Email,
		end.Logradouro, end.TipoLogradouro, end.Numero, end.Complemento, end.Bairro,
		end.CodigoMunicipio, end.UF, end.CEP,
		end.CodigoPaisExt, end.CEPExt, end.NomeCidadeExt, end.RegiaoExt,
		interm.RazaoSocial, interm.CPF, interm.CNPJ,
		p.Servico.CodigoMunicipio,
		interm.NIF, interm.MotivoAusenciaNIF, interm.InscricaoMunicipal, interm.CodigoMunicipio,
		p.Servico.ValorServicos, p.Servico.ValorDeducoes, p.Servico.ValorPIS, p.Servico.ValorCOFINS,
		p.Servico.ValorINSS, p.Servico.ValorIR, p.Servico.ValorCSLL,
		issRetido, p.Servico.ValorISS, p.Servico.ValorISSRetido, p.Servico.OutrasRetencoes,
		p.Servico.BaseCalculo, p.Servico.Aliquota, p.Servico.DescontoIncondicionado, p.Servico.DescontoCondicionado,
		p.Servico.ItemListaServico, p.Servico.CodigoCNAE, nullEmpty(munTaxCode), p.Servico.Discriminacao,
		p.Servico.PercentualTotalTributos, p.Servico.FonteTotalTributos,
		p.Servico.CodigoNBS, p.Servico.CodigoIndicadorOperacao,
		p.Servico.IbsCbsSituacaoTributaria, nullEmpty(classTrib), p.Servico.IbsCbsBaseCalculo,
		p.Servico.IbsUFAliquota, p.Servico.IbsMunAliquota, p.Servico.CbsAliquota,
		p.Servico.IbsUFValor, p.Servico.IbsMunValor, p.Servico.CbsValor,
		p.Servico.CodigoMunicipioIncidencia, p.Servico.SituacaoTributariaPisCofins,
		p.Servico.BaseCalculoPisCofins, p.Servico.AliquotaPIS, p.Servico.AliquotaCOFINS,
		p.Servico.TipoRetencaoPisCofins, p.Servico.ViasPublicas,
		p.Servico.LogradouroPrestacao, p.Servico.NumeroPrestacao, p.Servico.ComplementoPrestacao,
		p.Servico.BairroPrestacao, p.Servico.MunicipioPrestacao, p.Servico.UFPrestacao, p.Servico.CEPPrestacao,
		nullEmpty(headerMunicipality),
		nullEmpty(normalizeAccessKey(derefStr(p.ChaveNFSeSubstituida))),
		nfseUIMetadataJSON(p),
	)
	return err
}

func nfseUIMetadataJSON(p *SAPNFSePayload) []byte {
	send := true
	if p.EnviarEmailTomador != nil {
		send = p.EnviarEmailTomador.Value
	}
	b, err := json.Marshal(map[string]any{"enviar_email_tomador": send})
	if err != nil {
		return []byte(`{"enviar_email_tomador":true}`)
	}
	return b
}

func boolPtrFromFlexible(b *FlexibleBool) *bool {
	if b == nil {
		return nil
	}
	v := b.Value
	return &v
}
