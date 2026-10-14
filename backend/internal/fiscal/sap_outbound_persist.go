package fiscal

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus/fiscal-messaging/internal/platform/ids"
)

// persistOutboundNFe persists the full SAP outbound NF-e payload into the relational schema
// from migration 034. Must be called within a transaction.
// Maps from Portuguese flat fields to English database columns.
func (s *Service) persistOutboundNFe(
	ctx context.Context,
	tx pgx.Tx,
	organizationID, documentID uuid.UUID,
	p *SAPNFePayload,
	companyUF *string,
) error {
	// Update organization_nfe with all header fields
	_, err := tx.Exec(ctx, `
		UPDATE organization_nfe SET
			-- IDE fields
			nature_of_operation = $3,
			operation_type = $4,
			consumer_final = $5,
			presence_indicator = $6,
			intermediary_indicator = $7,
			finality = $8,
			change_amount = $9,
			destination_indicator = $10,
			intermediary_cnpj = $11,
			intermediary_id = $12,
			-- emission_date is date; issued_at is timestamptz. Cast $13 to one type
			-- first so Postgres does not raise 42P08 (inconsistent types deduced).
			emission_date = ($13::timestamptz)::date,
			entry_exit_date = $14,
			unique_code = $15,
			issued_at = coalesce($13::timestamptz, issued_at),
			emission_type = $126,
			access_key_precomputed = $127,
			contingency_at = $128,
			contingency_justification = $129,
			tp_nf_debito = $130,
			tp_nf_credito = $131,
			municipality_code_fg = $132,
			municipality_code_fg_ibs = $133,
			total_ibs_uf = $134,
			total_ibs_mun = $135,
			
			-- Issuer details (Portuguese: nome_emitente → English: issuer_legal_name)
			issuer_legal_name = $16,
			issuer_trade_name = $17,
			issuer_ie = $18,
			issuer_iest = $19,
			issuer_im = $20,
			issuer_cnae = $21,
			issuer_crt = $22,
			issuer_street = $23,
			issuer_number = $24,
			issuer_complement = $25,
			issuer_district = $26,
			issuer_city = $27,
			issuer_uf = $28,
			issuer_cep = $29,
			issuer_phone = $30,
			
			-- Recipient details (Portuguese: nome_destinatario → English: recipient_legal_name)
			recipient_legal_name = $31,
			recipient_ie = $32,
			recipient_isuf = $33,
			recipient_im = $34,
			recipient_email = $35,
			recipient_street = $36,
			recipient_number = $37,
			recipient_complement = $38,
			recipient_district = $39,
			recipient_city_code = $40,
			recipient_city = $41,
			uf_recipient = $42,
			recipient_cep = $43,
			recipient_country_code = $44,
			recipient_country = $45,
			recipient_phone = $46,
			
			-- Pickup location
			pickup_cnpj = $47,
			pickup_cpf = $48,
			pickup_legal_name = $49,
			pickup_street = $50,
			pickup_number = $51,
			pickup_complement = $52,
			pickup_district = $53,
			pickup_city_code = $54,
			pickup_city = $55,
			pickup_uf = $56,
			pickup_cep = $57,
			pickup_country_code = $58,
			
			-- Delivery location
			delivery_cnpj = $59,
			delivery_cpf = $60,
			delivery_legal_name = $61,
			delivery_street = $62,
			delivery_number = $63,
			delivery_complement = $64,
			delivery_district = $65,
			delivery_city_code = $66,
			delivery_city = $67,
			delivery_uf = $68,
			delivery_cep = $69,
			delivery_country_code = $70,
			
			-- Totals (Portuguese: icms_base_calculo → English: total_icms_base)
			total_icms_base = $71,
			total_icms = $72,
			total_icms_deson = $73,
			total_fcp_uf_dest = $74,
			total_icms_uf_dest = $75,
			total_icms_uf_remet = $76,
			total_fcp = $77,
			total_icms_st_base = $78,
			total_icms_st = $79,
			total_fcp_st = $80,
			total_fcp_st_ret = $81,
			total_products = $82,
			total_freight = $83,
			total_insurance = $84,
			total_discount = $85,
			total_ii = $86,
			total_ipi = $87,
			total_ipi_devol = $88,
			total_pis = $89,
			total_cofins = $90,
			total_other = $91,
			total_nf = $92,
			total_approx_taxes = $93,
			total_ibs = $94,
			total_cbs = $95,
			total_is = $96,
			total_ibs_base = $97,
			total_cbs_base = $98,
			total_is_base = $99,
			
			-- Invoice (Portuguese: numero_fatura → English: invoice_number)
			invoice_number = $100,
			invoice_original_value = $101,
			invoice_discount_value = $102,
			invoice_net_value = $103,
			
			-- Transport (Portuguese: modalidade_frete → English: transport_modality)
			transport_modality = $104,
			carrier_cnpj = $105,
			carrier_cpf = $106,
			carrier_legal_name = $107,
			carrier_ie = $108,
			carrier_street = $109,
			carrier_city = $110,
			carrier_uf = $111,
			vehicle_plate = $112,
			vehicle_uf = $113,
			vehicle_rntc = $114,
			
			-- Additional info
			additional_info_fisco = $115,
			additional_info_taxpayer = $116,
			
			-- Sugarcane
			sugarcane_crop = $117,
			sugarcane_ref_month = $118,
			sugarcane_ref_year = $119,
			sugarcane_quantity = $120,
			sugarcane_atrs = $121,
			sugarcane_unit_value = $122,
			sugarcane_total_value = $123,
			
			-- Set model and recipient document
			model = '55',
			recipient_document = COALESCE($124, $125)
		WHERE organization_document_id = $1 AND organization_id = $2
	`,
		documentID, organizationID,
		// IDE (3-15)
		p.NaturezaOperacao, p.TipoDocumento, p.ConsumidorFinal, p.PresencaComprador,
		blankToNil(p.IndicadorIntermediario), p.FinalidadeEmissao, p.ValorTroco, p.LocalDestino,
		blankToNil(p.CnpjIntermediario), blankToNil(p.IdIntermediario),
		parseRFC3339(p.DataEmissao), parseRFC3339(p.DataEntradaSaida), p.CodigoUnico,
		// Issuer (16-30) — nome_emitente → issuer_legal_name
		p.NomeEmitente, p.NomeFantasiaEmitente, p.InscricaoEstadualEmitente, blankToNil(p.InscricaoEstadualStEmitente),
		blankToNil(p.InscricaoMunicipalEmitente), blankToNil(p.CnaeFiscalEmitente), p.RegimeTributarioEmitente,
		p.LogradouroEmitente, p.NumeroEmitente, blankToNil(p.ComplementoEmitente), p.BairroEmitente,
		p.MunicipioEmitente, p.UfEmitente, cepDigits(p.CepEmitente), p.TelefoneEmitente,
		// Recipient (31-46) — nome_destinatario → recipient_legal_name, codigo_municipio_destinatario → recipient_city_code
		p.NomeDestinatario, p.InscricaoEstadualDestinatario, blankToNil(p.InscricaoSuframaDestinatario),
		blankToNil(p.InscricaoMunicipalDestinatario), blankToNil(p.EmailDestinatario),
		p.LogradouroDestinatario, p.NumeroDestinatario, blankToNil(p.ComplementoDestinatario), p.BairroDestinatario,
		p.CodigoMunicipioDestinatario, p.MunicipioDestinatario, p.UfDestinatario, cepDigits(p.CepDestinatario),
		p.CodigoPaisDestinatario, p.PaisDestinatario, p.TelefoneDestinatario,
		// Pickup (47-58)
		blankToNil(p.CnpjRetirada), blankToNil(p.CpfRetirada), blankToNil(p.NomeRetirada), blankToNil(p.LogradouroRetirada), blankToNil(p.NumeroRetirada),
		blankToNil(p.ComplementoRetirada), blankToNil(p.BairroRetirada), blankToNil(p.CodigoMunicipioRetirada), blankToNil(p.MunicipioRetirada),
		blankToNil(p.UfRetirada), cepDigits(p.CepRetirada), blankToNil(p.CodigoPaisRetirada),
		// Delivery (59-70)
		blankToNil(p.CnpjEntrega), blankToNil(p.CpfEntrega), blankToNil(p.NomeEntrega), blankToNil(p.LogradouroEntrega), blankToNil(p.NumeroEntrega),
		blankToNil(p.ComplementoEntrega), blankToNil(p.BairroEntrega), blankToNil(p.CodigoMunicipioEntrega), blankToNil(p.MunicipioEntrega),
		blankToNil(p.UfEntrega), cepDigits(p.CepEntrega), blankToNil(p.CodigoPaisEntrega),
		// Totals (71-99) — icms_base_calculo → total_icms_base, valor_total → total_nf
		p.IcmsBaseCalculo, p.IcmsValorTotal, p.IcmsDesonValorTotal, p.FcpUfDestValorTotal,
		p.IcmsUfDestValorTotal, p.IcmsUfRemetValorTotal, p.FcpValorTotal,
		p.IcmsStBaseCalculo, p.IcmsStValorTotal, p.FcpStValorTotal, p.FcpStRetValorTotal,
		p.ValorProdutos, p.ValorFrete, p.ValorSeguro, p.ValorDesconto,
		p.ValorTotalIi, p.ValorIpi, p.ValorIpiDevolvido, p.ValorPis, p.ValorCofins,
		p.ValorOutrasDespesas, p.ValorTotal, p.ValorTotalTributos,
		p.IbsValorTotal, p.CbsValorTotal, p.IsValorTotal,
		p.IbsBaseCalculo, p.CbsBaseCalculo, p.IsBaseCalculo,
		// Invoice (100-103) — numero_fatura → invoice_number
		p.NumeroFatura, p.ValorOriginalFatura, p.ValorDescontoFatura, p.ValorLiquidoFatura,
		// Transport (104-114) — modalidade_frete → transport_modality, nome_transportador → carrier_legal_name
		p.ModalidadeFrete, blankToNil(p.CnpjTransportador), blankToNil(p.CpfTransportador), blankToNil(p.NomeTransportador),
		blankToNil(p.InscricaoEstadualTransportador), blankToNil(p.EnderecoTransportador), blankToNil(p.MunicipioTransportador), blankToNil(p.UfTransportador),
		blankToNil(p.VeiculoPlaca), blankToNil(p.VeiculoUf), blankToNil(p.VeiculoRntc),
		// Additional info (115-116)
		blankToNil(p.InformacoesAdicionaisFisco), blankToNil(p.InformacoesAdicionaisContribuinte),
		// Sugarcane (117-123)
		p.CanaSafra, extractMonth(p.CanaMesAnoRef), extractYear(p.CanaMesAnoRef),
		p.CanaQuantidade, p.CanaAtrs, p.CanaValorUnitario, p.CanaValorTotal,
		// Recipient document (124-125)
		p.CnpjDestinatario, p.CpfDestinatario,
		// Contingency / reforma header (126-135)
		p.TipoEmissao, p.ChaveAcesso, parseRFC3339(p.DhContingencia), p.XJustificativa,
		blankToNil(p.TpNfDebito), blankToNil(p.TpNfCredito), blankToNil(p.CodigoMunicipioFatoGerador), blankToNil(p.CodigoMunicipioFatoGeradorIbs),
		p.IbsUfValorTotal, p.IbsMunValorTotal,
	)
	if err != nil {
		return err
	}

	// Insert items
	for i, item := range p.Items {
		if err := s.persistOutboundItem(ctx, tx, organizationID, documentID, &item, i+1); err != nil {
			return err
		}
	}

	// Insert child arrays
	if err := s.persistOutboundChildArrays(ctx, tx, organizationID, documentID, p); err != nil {
		return err
	}

	return nil
}

func (s *Service) persistOutboundItem(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, item *SAPItem, fallbackItemNumber int) error {
	itemID := ids.New()

	itemNumber := fallbackItemNumber
	if item.NumeroItem != nil && *item.NumeroItem > 0 {
		itemNumber = *item.NumeroItem
	}

	// Extract float from StringOrFloat64
	var unitPriceCommercial, unitPriceTaxable *float64
	if item.ValorUnitarioComercial != nil {
		unitPriceCommercial = item.ValorUnitarioComercial.ToFloat64Ptr()
	}
	if item.ValorUnitarioTributavel != nil {
		unitPriceTaxable = item.ValorUnitarioTributavel.ToFloat64Ptr()
	}

	_, err := tx.Exec(ctx, `
		INSERT INTO organization_nfe_items (
			id, organization_id, organization_document_id, item_number, status,
			supplier_material_code, description, ncm, cfop,
			quantity, unit, unit_price, total_amount,
			taxable_quantity, taxable_unit, taxable_unit_price,
			product_ean, product_extipi, product_cest, product_fci_number, ind_total,
			freight_value, insurance_value, discount_value,
			purchase_order_reference_raw, purchase_order_item_reference_raw,
			-- ICMS
			icms_origin, icms_cst, icms_csosn, icms_modality, icms_base, icms_rate, icms_value,
			icms_fcp_rate, icms_fcp_value, icms_reduction_rate, icms_deson_reason, icms_deson_value,
			cbenef, icms_valor_operacao, icms_percentual_diferimento, icms_valor_diferido,
			-- ICMS ST
			icms_st_modality, icms_st_mva_rate, icms_st_reduction_rate, icms_st_base, icms_st_rate,
			icms_st_value, icms_st_fcp_rate, icms_st_fcp_value,
			-- IPI
			ipi_cst, ipi_base, ipi_rate, ipi_value,
			-- PIS
			pis_cst, pis_base, pis_rate, pis_value,
			-- COFINS
			cofins_cst, cofins_base, cofins_rate, cofins_value,
			-- IBS/CBS/IS
			ibs_cst, ibs_c_class_trib, ibs_base, ibs_rate, ibs_value,
			ibs_aliquota_uf, ibs_valor_uf, ibs_aliquota_mun, ibs_valor_mun,
			cbs_cst, cbs_c_class_trib, cbs_base, cbs_rate, cbs_value,
			is_base, is_rate, is_value, is_c_class_trib,
			ibscbs_q_bc_mono, ibscbs_ad_rem_ibs, ibscbs_v_ibs_mono, ibscbs_ad_rem_cbs, ibscbs_v_cbs_mono
		) VALUES (
			$1, $2, $3, $4, 'SKIPPED',
			$5, $6, $7, $8, $9, $10, $11, $12,
			$13, $14, $15,
			$16, $17, $18, $19, $20,
			$21, $22, $23,
			$24, $25,
			$26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
			$38, $39, $40, $41,
			$42, $43, $44, $45, $46, $47, $48, $49,
			$50, $51, $52, $53,
			$54, $55, $56, $57,
			$58, $59, $60, $61,
			$62, $63, $64, $65, $66,
			$67, $68, $69, $70,
			$71, $72, $73, $74, $75,
			$76, $77, $78, $79,
			$80, $81, $82, $83, $84
		)
	`,
		itemID, organizationID, documentID, itemNumber,
		item.CodigoProduto, item.Descricao, item.CodigoNcm, item.Cfop,
		item.QuantidadeComercial, item.UnidadeComercial, unitPriceCommercial, item.ValorBruto,
		item.QuantidadeTributavel, item.UnidadeTributavel, unitPriceTaxable,
		blankToNil(item.CodigoBarrasComercial), blankToNil(item.CodigoExTipi), blankToNil(item.Cest), blankToNil(item.NumeroFCI), blankToNil(item.IncluiNoTotal),
		item.ValorFrete, item.ValorSeguro, item.ValorDesconto,
		blankToNil(item.PedidoCompra), blankToNil(item.NumeroItemPedidoCompra),
		item.IcmsOrigem, item.IcmsCst, item.IcmsCsosn, item.IcmsModalidade,
		item.IcmsBase, item.IcmsAliquota, item.IcmsValor,
		item.IcmsFcpAliquota, item.IcmsFcpValor, item.IcmsReducaoPercent,
		item.IcmsMotivoDesoneracao, item.IcmsValorDesoneracao,
		item.Cbenef, item.IcmsValorOperacao, item.IcmsPercentualDiferimento, item.IcmsValorDiferido,
		item.IcmsStModalidade, item.IcmsStMvaAliquota, item.IcmsStReducaoPercent,
		item.IcmsStBase, item.IcmsStAliquota, item.IcmsStValor,
		item.IcmsStFcpAliquota, item.IcmsStFcpValor,
		item.IpiCst, item.IpiBase, item.IpiAliquota, item.IpiValor,
		item.PisCst, item.PisBase, item.PisAliquota, item.PisValor,
		item.CofinsCst, item.CofinsBase, item.CofinsAliquota, item.CofinsValor,
		item.IbsCst, item.IbsCClassTrib, item.IbsBase, item.IbsAliquota, item.IbsValor,
		item.IbsAliquotaUf, item.IbsValorUf, item.IbsAliquotaMun, item.IbsValorMun,
		item.CbsCst, item.CbsCClassTrib, item.CbsBase, item.CbsAliquota, item.CbsValor,
		item.IsBase, item.IsAliquota, item.IsValor, item.IsCClassTrib,
		item.IbsCbsQBcMono, item.IbsCbsAdRemIbs, item.IbsCbsVIbsMono, item.IbsCbsAdRemCbs, item.IbsCbsVCbsMono,
	)
	if err != nil {
		return err
	}

	// Insert item child arrays
	return s.persistItemChildArrays(ctx, tx, organizationID, documentID, itemID, item)
}

func (s *Service) persistOutboundChildArrays(ctx context.Context, tx pgx.Tx, organizationID, documentID uuid.UUID, p *SAPNFePayload) error {
	// Referenced documents
	for _, doc := range p.NotasReferenciadas {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_referenced_docs (
				id, organization_id, organization_document_id, ref_type, access_key, uf, year_month,
				cnpj, model, series, number
			) VALUES ($1,$2,$3,'NFe',$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, doc.ChaveAcesso, doc.Uf, doc.AnoMes,
			doc.Cnpj, doc.Modelo, doc.Serie, doc.Numero)
		if err != nil {
			return err
		}
	}

	// Anticipation keys
	for _, key := range p.ChavesNfeAntecipacaoPagamento {
		if key.ChaveNfe != nil {
			_, err := tx.Exec(ctx, `
				INSERT INTO organization_nfe_anticipation_keys (id, organization_id, organization_document_id, access_key)
				VALUES ($1,$2,$3,$4)
			`, ids.New(), organizationID, documentID, key.ChaveNfe)
			if err != nil {
				return err
			}
		}
	}

	// Previous DFe keys
	for _, key := range p.ChavesAcessoDfeAnteriores {
		if key.ChaveDfe != nil {
			_, err := tx.Exec(ctx, `
				INSERT INTO organization_nfe_previous_dfe_keys (id, organization_id, organization_document_id, access_key)
				VALUES ($1,$2,$3,$4)
			`, ids.New(), organizationID, documentID, key.ChaveDfe)
			if err != nil {
				return err
			}
		}
	}

	// Authorized persons
	for _, pessoa := range p.PessoasAutorizadas {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_authorized_persons (id, organization_id, organization_document_id, cnpj, cpf)
			VALUES ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, documentID, pessoa.Cnpj, pessoa.Cpf)
		if err != nil {
			return err
		}
	}

	// Duplicates
	for _, dup := range p.Duplicatas {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_duplicates (id, organization_id, organization_document_id, number, due_date, value)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, ids.New(), organizationID, documentID, dup.Numero, parseDate(dup.DataVencimento), dup.Valor)
		if err != nil {
			return err
		}
	}

	// Payments
	for _, pag := range p.FormasPagamento {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_payments (
				id, organization_id, organization_document_id, payment_indicator, payment_method, value,
				card_cnpj, card_flag, card_authorization, integration_type
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		`, ids.New(), organizationID, documentID, pag.IndicadorPagamento, pag.FormaPagamento, pag.ValorPagamento,
			pag.CnpjCredenciadora, pag.BandeiraOperadora, pag.NumeroAutorizacao, pag.TipoIntegracao)
		if err != nil {
			return err
		}
	}

	// Trailers
	for _, reboque := range p.Reboques {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_trailers (
				id, organization_id, organization_document_id, plate, uf, rntc, wagon_id, ferry_id
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, ids.New(), organizationID, documentID, reboque.Placa, reboque.Uf, reboque.Rntc, reboque.Vagao, reboque.Balsa)
		if err != nil {
			return err
		}
	}

	// Volumes
	for _, vol := range p.Volumes {
		volID := ids.New()
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_volumes (
				id, organization_id, organization_document_id, quantity, species, brand, numbering, gross_weight, net_weight
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, volID, organizationID, documentID, vol.Quantidade.ToFloat64Ptr(), vol.Especie, vol.Marca, vol.Numero, vol.PesoBruto, vol.PesoLiquido)
		if err != nil {
			return err
		}

		// Volume seals
		for _, lacre := range vol.Lacres {
			if lacre.Numero != nil {
				_, err := tx.Exec(ctx, `
					INSERT INTO organization_nfe_volume_seals (id, organization_id, organization_document_id, volume_id, seal_number)
					VALUES ($1,$2,$3,$4,$5)
				`, ids.New(), organizationID, documentID, volID, lacre.Numero)
				if err != nil {
					return err
				}
			}
		}
	}

	// Contributor notes
	for _, obs := range p.ObservacoesContribuinte {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_contributor_notes (id, organization_id, organization_document_id, field_code, field_text)
			VALUES ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, documentID, obs.Campo, obs.Texto)
		if err != nil {
			return err
		}
	}

	// Fisco notes
	for _, obs := range p.ObservacoesFisco {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_fisco_notes (id, organization_id, organization_document_id, field_code, field_text)
			VALUES ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, documentID, obs.Campo, obs.Texto)
		if err != nil {
			return err
		}
	}

	// Referenced processes
	for _, proc := range p.ProcessosReferenciados {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_referenced_processes (id, organization_id, organization_document_id, process_number, process_origin)
			VALUES ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, documentID, proc.Numero, proc.Origem)
		if err != nil {
			return err
		}
	}

	// Sugarcane days
	for _, dia := range p.CanaFornecimentos {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_sugarcane_days (id, organization_id, organization_document_id, harvest_day, quantity)
			VALUES ($1,$2,$3,$4,$5)
		`, ids.New(), organizationID, documentID, dia.Dia, dia.Quantidade)
		if err != nil {
			return err
		}
	}

	// Sugarcane deductions
	for _, ded := range p.CanaDeducoes {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_sugarcane_deductions (id, organization_id, organization_document_id, deduction_code, deduction_description, deduction_value)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, ids.New(), organizationID, documentID, ded.Codigo, ded.Descricao, ded.Valor)
		if err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) persistItemChildArrays(ctx context.Context, tx pgx.Tx, organizationID, documentID, itemID uuid.UUID, item *SAPItem) error {
	// NVEs
	for _, nve := range item.Nves {
		if nve.Nve != nil {
			_, err := tx.Exec(ctx, `
				INSERT INTO organization_nfe_item_nves (id, organization_id, organization_document_id, organization_nfe_item_id, nve_code)
				VALUES ($1,$2,$3,$4,$5)
			`, ids.New(), organizationID, documentID, itemID, nve.Nve)
			if err != nil {
				return err
			}
		}
	}

	// Imports
	for _, imp := range item.DocumentosImportacao {
		impID := ids.New()
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_item_imports (
				id, organization_id, organization_document_id, organization_nfe_item_id, di_number, di_date,
				customs_clearance_location, customs_clearance_uf, customs_clearance_date, transport_code,
				afrmm_value, intermediary_import_code, exporter_cnpj, exporter_uf, exporter_location
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
		`, impID, organizationID, documentID, itemID, imp.NumeroDi, parseDate(imp.DataDi),
			imp.LocalDesembaraco, imp.UfDesembaraco, parseDate(imp.DataDesembaraco), imp.CodigoTransporte,
			imp.ValorAfrmm, imp.CodigoIntermediacao, imp.CnpjExportador, imp.UfExportador, imp.LocalExportador)
		if err != nil {
			return err
		}

		// Import additions
		for _, adi := range imp.Adicoes {
			_, err := tx.Exec(ctx, `
				INSERT INTO organization_nfe_item_import_additions (
					id, organization_id, organization_document_id, import_id, addition_number, addition_sequence,
					manufacturer_code, discount_value, drawback_number
				) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			`, ids.New(), organizationID, documentID, impID, adi.NumeroAdicao, adi.SequenciaAdicao,
				adi.CodigoFabricante, adi.ValorDesconto, adi.NumeroDrawback)
			if err != nil {
				return err
			}
		}
	}

	// Exports
	for _, exp := range item.DetalhesExportacao {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_item_exports (
				id, organization_id, organization_document_id, organization_nfe_item_id, drawback_number, re_number, chave_nfe_received, quantity_exported
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, ids.New(), organizationID, documentID, itemID, exp.NumeroDrawback, exp.NumeroRe, exp.ChaveNfeRecebida, exp.QuantidadeExportada)
		if err != nil {
			return err
		}
	}

	// Traceability
	for _, rastro := range item.Rastros {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_item_traces (
				id, organization_id, organization_document_id, organization_nfe_item_id, batch_number, batch_quantity,
				manufacture_date, expiry_date, agregate_code
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, ids.New(), organizationID, documentID, itemID, rastro.NumeroLote, rastro.QuantidadeLote.ToFloat64Ptr(),
			parseDate(rastro.DataFabricacao), parseDate(rastro.DataValidade), rastro.CodigoAgregacao)
		if err != nil {
			return err
		}
	}

	// Fuel origins
	for _, origem := range item.OrigensCombustivel {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_item_fuel_origins (
				id, organization_id, organization_document_id, organization_nfe_item_id, pump_number, nozzle_number,
				tank_number, initial_value, final_value
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, ids.New(), organizationID, documentID, itemID, origem.NumeroBomba, origem.NumeroBico,
			origem.NumeroTanque, origem.ValorInicial, origem.ValorFinal)
		if err != nil {
			return err
		}
	}

	// Presumed credits
	for _, cred := range item.InfosCreditoPresumido {
		_, err := tx.Exec(ctx, `
			INSERT INTO organization_nfe_item_presumed_credits (
				id, organization_id, organization_document_id, organization_nfe_item_id,
				codigo_credito_presumido, base, presumed_percentage, presumed_value
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		`, ids.New(), organizationID, documentID, itemID,
			cred.CodigoCreditoPresumido, cred.Base, cred.PercentualPresumido, cred.ValorPresumido)
		if err != nil {
			return err
		}
	}

	return nil
}

// Date/time parsing helpers
func blankToNil(s *string) *string {
	if s == nil {
		return nil
	}
	if strings.TrimSpace(*s) == "" {
		return nil
	}
	return s
}

func cepDigits(s *string) *string {
	if s == nil {
		return nil
	}
	d := digitsOnly(*s)
	if d == "" {
		return nil
	}
	if len(d) > 8 {
		d = d[:8]
	}
	return &d
}

func parseDate(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil
	}
	return &t
}

func parseRFC3339(s *string) *time.Time {
	if s == nil || *s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, *s)
	if err != nil {
		// Try date-only
		return parseDate(s)
	}
	return &t
}

// extractMonth extracts MM from "YYYYMM" or "YYYY-MM" format
func extractMonth(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	str := *s
	if len(str) >= 6 {
		month := str[4:6]
		return &month
	}
	return nil
}

// extractYear extracts YYYY from "YYYYMM" or "YYYY-MM" format
func extractYear(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	str := *s
	if len(str) >= 4 {
		year := str[0:4]
		return &year
	}
	return nil
}
