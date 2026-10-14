package fiscal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// SAPNFePayload represents the full SAP outbound NF-e JSON contract (YNEX_IF_MSG_NFE).
// CRITICAL: The SAP contract is FLAT Portuguese snake_case at root — NOT nested objects.
// All fields use pointers to distinguish between omitted (nil → NULL) and present values.
type SAPNFePayload struct {
	// ========== IDE - Header Identification ==========
	NaturezaOperacao        *string `json:"natureza_operacao"`
	Serie                   *string `json:"serie"`
	Numero                  *string `json:"numero"`
	CodigoUnico             *string `json:"codigo_unico"`
	DataEmissao             *string `json:"data_emissao"` // RFC3339
	DataEntradaSaida        *string `json:"data_entrada_saida"` // RFC3339 or date
	TipoDocumento           *string `json:"tipo_documento"` // tpNF
	LocalDestino            *string `json:"local_destino"` // idDest
	ConsumidorFinal         *string `json:"consumidor_final"` // indFinal
	PresencaComprador       *string `json:"presenca_comprador"` // indPres
	IndicadorIntermediario  *string `json:"indicador_intermediario"` // indIntermed
	FinalidadeEmissao       *string `json:"finalidade_emissao"` // finNFe
	TipoEmissao             *string `json:"tipo_emissao"`       // tpEmis (1=normal, 6=SVC-AN, 7=SVC-RS, …)
	ChaveAcesso             *string `json:"chave_acesso"`       // optional precomputed access key (digit 35 = tpEmis)
	DhContingencia          *string `json:"dh_contingencia"`    // dhCont — required for tpEmis 2–5
	XJustificativa          *string `json:"x_justificativa"`    // xJust — required for tpEmis 2–5
	TpNfDebito              *string `json:"tp_nf_debito"`       // tpNFDebito — finNFe=5
	TpNfCredito             *string `json:"tp_nf_credito"`      // tpNFCredito — finNFe=6
	CodigoMunicipioFatoGerador *string `json:"codigo_municipio_fato_gerador"` // cMunFG
	CodigoMunicipioFatoGeradorIbs *string `json:"codigo_municipio_fato_gerador_ibs"` // cMunFGIBS
	ValorTroco              *float64 `json:"valor_troco"`
	CnpjIntermediario       *string `json:"cnpj_intermediario"`
	IdIntermediario         *string `json:"id_intermediario"`
	CodigoIndicadorOperacaoFornecimento *string `json:"codigo_indicador_operacao_fornecimento"` // indPresCompra

	// ========== Emitente (FLAT at root with _emitente suffix) ==========
	CnpjEmitente              *string `json:"cnpj_emitente"`
	CpfEmitente               *string `json:"cpf_emitente"`
	NomeEmitente              *string `json:"nome_emitente"` // xNome
	NomeFantasiaEmitente      *string `json:"nome_fantasia_emitente"` // xFant
	LogradouroEmitente        *string `json:"logradouro_emitente"`
	NumeroEmitente            *string `json:"numero_emitente"`
	ComplementoEmitente       *string `json:"complemento_emitente"`
	BairroEmitente            *string `json:"bairro_emitente"`
	MunicipioEmitente         *string `json:"municipio_emitente"` // xMun
	CepEmitente               *string `json:"cep_emitente"`
	UfEmitente                *string `json:"uf_emitente"`
	TelefoneEmitente          *string `json:"telefone_emitente"`
	InscricaoEstadualEmitente *string `json:"inscricao_estadual_emitente"` // IE
	InscricaoEstadualStEmitente *string `json:"inscricao_estadual_st_emitente"` // IEST
	InscricaoMunicipalEmitente *string `json:"inscricao_municipal_emitente"` // IM
	CnaeFiscalEmitente        *string `json:"cnae_fiscal_emitente"`
	RegimeTributarioEmitente  *string `json:"regime_tributario_emitente"` // CRT
	InscricaoSuframaEmitente  *string `json:"inscricao_suframa_emitente"`

	// ========== Destinatário (FLAT at root with _destinatario suffix) ==========
	CnpjDestinatario          *string `json:"cnpj_destinatario"`
	CpfDestinatario           *string `json:"cpf_destinatario"`
	IdEstrangeiroDestinatario *string `json:"id_estrangeiro_destinatario"` // idEstrangeiro
	NomeDestinatario          *string `json:"nome_destinatario"` // xNome
	InscricaoEstadualDestinatario *string `json:"inscricao_estadual_destinatario"` // IE
	LogradouroDestinatario    *string `json:"logradouro_destinatario"`
	ComplementoDestinatario   *string `json:"complemento_destinatario"`
	NumeroDestinatario        *string `json:"numero_destinatario"`
	BairroDestinatario        *string `json:"bairro_destinatario"`
	CodigoMunicipioDestinatario *string `json:"codigo_municipio_destinatario"` // cMun
	MunicipioDestinatario     *string `json:"municipio_destinatario"` // xMun
	UfDestinatario            *string `json:"uf_destinatario"`
	CepDestinatario           *string `json:"cep_destinatario"`
	CodigoPaisDestinatario    *string `json:"codigo_pais_destinatario"`
	PaisDestinatario          *string `json:"pais_destinatario"`
	TelefoneDestinatario      *string `json:"telefone_destinatario"`
	IndicadorInscricaoEstadualDestinatario *string `json:"indicador_inscricao_estadual_destinatario"` // indIEDest
	InscricaoSuframaDestinatario *string `json:"inscricao_suframa_destinatario"`
	InscricaoMunicipalDestinatario *string `json:"inscricao_municipal_destinatario"` // IM
	EmailDestinatario         *string `json:"email_destinatario"`

	// ========== Retirada (FLAT at root with _retirada suffix) ==========
	CnpjRetirada          *string `json:"cnpj_retirada"`
	CpfRetirada           *string `json:"cpf_retirada"`
	NomeRetirada          *string `json:"nome_retirada"`
	LogradouroRetirada    *string `json:"logradouro_retirada"`
	NumeroRetirada        *string `json:"numero_retirada"`
	ComplementoRetirada   *string `json:"complemento_retirada"`
	BairroRetirada        *string `json:"bairro_retirada"`
	CodigoMunicipioRetirada *string `json:"codigo_municipio_retirada"`
	MunicipioRetirada     *string `json:"municipio_retirada"`
	UfRetirada            *string `json:"uf_retirada"`
	CepRetirada           *string `json:"cep_retirada"`
	CodigoPaisRetirada    *string `json:"codigo_pais_retirada"`
	PaisRetirada          *string `json:"pais_retirada"`

	// ========== Entrega (FLAT at root with _entrega suffix) ==========
	CnpjEntrega          *string `json:"cnpj_entrega"`
	CpfEntrega           *string `json:"cpf_entrega"`
	NomeEntrega          *string `json:"nome_entrega"`
	LogradouroEntrega    *string `json:"logradouro_entrega"`
	NumeroEntrega        *string `json:"numero_entrega"`
	ComplementoEntrega   *string `json:"complemento_entrega"`
	BairroEntrega        *string `json:"bairro_entrega"`
	CodigoMunicipioEntrega *string `json:"codigo_municipio_entrega"`
	MunicipioEntrega     *string `json:"municipio_entrega"`
	UfEntrega            *string `json:"uf_entrega"`
	CepEntrega           *string `json:"cep_entrega"`
	CodigoPaisEntrega    *string `json:"codigo_pais_entrega"`
	PaisEntrega          *string `json:"pais_entrega"`

	// ========== Totais (FLAT at root - ICMSTot) ==========
	IcmsBaseCalculo       *float64 `json:"icms_base_calculo"` // vBC
	IcmsValorTotal        *float64 `json:"icms_valor_total"` // vICMS
	ValorProdutos         *float64 `json:"valor_produtos"` // vProd
	ValorFrete            *float64 `json:"valor_frete"` // vFrete
	ValorSeguro           *float64 `json:"valor_seguro"` // vSeg
	ValorDesconto         *float64 `json:"valor_desconto"` // vDesc
	ValorTotalIi          *float64 `json:"valor_total_ii"` // vII
	ValorIpi              *float64 `json:"valor_ipi"` // vIPI
	ValorIpiDevolvido     *float64 `json:"valor_ipi_devolvido"` // vIPIDevol
	ValorPis              *float64 `json:"valor_pis"` // vPIS
	ValorCofins           *float64 `json:"valor_cofins"` // vCOFINS
	ValorOutrasDespesas   *float64 `json:"valor_outras_despesas"` // vOutro
	ValorTotal            *float64 `json:"valor_total"` // vNF
	ValorTotalTributos    *float64 `json:"valor_total_tributos"` // vTotTrib
	FcpValorTotal         *float64 `json:"fcp_valor_total"` // vFCP
	IcmsStBaseCalculo     *float64 `json:"icms_st_base_calculo"` // vBCST
	IcmsStValorTotal      *float64 `json:"icms_st_valor_total"` // vST
	FcpStValorTotal       *float64 `json:"fcp_st_valor_total"` // vFCPST
	FcpStRetValorTotal    *float64 `json:"fcp_st_ret_valor_total"` // vFCPSTRet
	IcmsDesonValorTotal   *float64 `json:"icms_deson_valor_total"` // vICMSDeson
	FcpUfDestValorTotal   *float64 `json:"fcp_uf_dest_valor_total"` // vFCPUFDest
	IcmsUfDestValorTotal  *float64 `json:"icms_uf_dest_valor_total"` // vICMSUFDest
	IcmsUfRemetValorTotal *float64 `json:"icms_uf_remet_valor_total"` // vICMSUFRemet

	// Tax reform totals (IBS/CBS/IS header)
	IbsValorTotal     *float64 `json:"ibs_valor_total"`
	IbsBaseCalculo    *float64 `json:"ibs_base_calculo"`
	IbsUfValorTotal   *float64 `json:"ibs_uf_valor_total"`  // gIBSUF/vIBSUF
	IbsMunValorTotal  *float64 `json:"ibs_mun_valor_total"` // gIBSMun/vIBSMun
	CbsValorTotal     *float64 `json:"cbs_valor_total"`
	CbsBaseCalculo    *float64 `json:"cbs_base_calculo"`
	IsValorTotal      *float64 `json:"is_valor_total"`
	IsBaseCalculo     *float64 `json:"is_base_calculo"`

	// ========== Fatura/Invoice (FLAT at root) ==========
	NumeroFatura         *string  `json:"numero_fatura"` // nFat
	ValorOriginalFatura  *float64 `json:"valor_original_fatura"` // vOrig
	ValorDescontoFatura  *float64 `json:"valor_desconto_fatura"` // vDesc
	ValorLiquidoFatura   *float64 `json:"valor_liquido_fatura"` // vLiq

	// ========== Transporte (FLAT at root) ==========
	ModalidadeFrete         *string  `json:"modalidade_frete"` // modFrete
	CnpjTransportador       *string  `json:"cnpj_transportador"`
	CpfTransportador        *string  `json:"cpf_transportador"`
	NomeTransportador       *string  `json:"nome_transportador"` // xNome
	InscricaoEstadualTransportador *string `json:"inscricao_estadual_transportador"` // IE
	EnderecoTransportador   *string  `json:"endereco_transportador"` // xEnder
	MunicipioTransportador  *string  `json:"municipio_transportador"` // xMun
	UfTransportador         *string  `json:"uf_transportador"`
	VeiculoPlaca            *string  `json:"veiculo_placa"`
	VeiculoUf               *string  `json:"veiculo_uf"`
	VeiculoRntc             *string  `json:"veiculo_rntc"`
	TransporteIcmsServico   *float64 `json:"transporte_icms_servico"`
	TransporteIcmsBaseCalculo *float64 `json:"transporte_icms_base_calculo"`
	TransporteIcmsAliquota  *float64 `json:"transporte_icms_aliquota"`
	TransporteIcmsValor     *float64 `json:"transporte_icms_valor"`
	TransporteIcmsCfop      *string  `json:"transporte_icms_cfop"`
	TransporteIcmsCodigoMunicipio *string `json:"transporte_icms_codigo_municipio"`
	UfLocalEmbarque         *string  `json:"uf_local_embarque"`
	LocalEmbarque           *string  `json:"local_embarque"`
	LocalDespacho           *string  `json:"local_despacho"`

	// ========== Additional Info (FLAT at root) ==========
	InformacoesAdicionaisFisco        *string `json:"informacoes_adicionais_fisco"` // infAdFisco
	InformacoesAdicionaisContribuinte *string `json:"informacoes_adicionais_contribuinte"` // infCpl

	// ========== Sugarcane/Agro (FLAT at root with cana_ prefix) ==========
	CanaSafra           *string  `json:"cana_safra"`
	CanaMesAnoRef       *string  `json:"cana_mes_ano_ref"`
	CanaQuantidade      *float64 `json:"cana_quantidade"`
	CanaAtrs            *float64 `json:"cana_atrs"`
	CanaValorUnitario   *float64 `json:"cana_valor_unitario"`
	CanaValorTotal      *float64 `json:"cana_valor_total"`

	// ========== Agro defensivo (FLAT at root with agropecuario_ prefix) ==========
	AgropecuarioLote           *string `json:"agropecuario_lote"`
	AgropecuarioQuantidadeLote *float64 `json:"agropecuario_quantidade_lote"`
	AgropecuarioDataFabricacao *string `json:"agropecuario_data_fabricacao"` // date
	AgropecuarioDataValidade   *string `json:"agropecuario_data_validade"` // date

	// ========== Arrays (stay as arrays) ==========
	NotasReferenciadas []SAPNotaReferenciada `json:"notas_referenciadas,omitempty"`
	ChavesNfeAntecipacaoPagamento []SAPChaveNfe `json:"chaves_nfe_antecipacao_pagamento,omitempty"`
	ChavesAcessoDfeAnteriores []SAPChaveDfe `json:"chaves_acesso_dfe_anteriores,omitempty"`
	PessoasAutorizadas []SAPPessoaAutorizada `json:"pessoas_autorizadas,omitempty"`
	Duplicatas []SAPDuplicata `json:"duplicatas,omitempty"`
	FormasPagamento []SAPPagamento `json:"formas_pagamento,omitempty"`
	Reboques []SAPReboque `json:"reboques,omitempty"`
	Volumes []SAPVolume `json:"volumes,omitempty"`
	ObservacoesContribuinte []SAPObservacao `json:"observacoes_contribuinte,omitempty"`
	ObservacoesFisco []SAPObservacao `json:"observacoes_fisco,omitempty"`
	ProcessosReferenciados []SAPProcessoReferenciado `json:"processos_referenciados,omitempty"`
	CanaFornecimentos []SAPCanaFornecimento `json:"cana_fornecimentos,omitempty"`
	CanaDeducoes []SAPCanaDeducao `json:"cana_deducoes,omitempty"`
	AgropecuarioDefensivo []SAPAgropecuarioDefensivo `json:"agropecuario_defensivo,omitempty"`
	Items []SAPItem `json:"items,omitempty"`
}

type SAPNotaReferenciada struct {
	ChaveAcesso *string `json:"chave_acesso"`
	Uf          *string `json:"uf"`
	AnoMes      *string `json:"ano_mes"`
	Cnpj        *string `json:"cnpj"`
	Modelo      *string `json:"modelo"`
	Serie       *string `json:"serie"`
	Numero      *string `json:"numero"`
}

type SAPChaveNfe struct {
	ChaveNfe *string `json:"chave_nfe"`
}

type SAPChaveDfe struct {
	ChaveDfe *string `json:"chave_dfe"`
}

type SAPPessoaAutorizada struct {
	Cnpj *string `json:"cnpj"`
	Cpf  *string `json:"cpf"`
}

type SAPDuplicata struct {
	Numero         *string  `json:"numero"`
	DataVencimento *string  `json:"data_vencimento"` // date
	Valor          *float64 `json:"valor"`
}

type SAPPagamento struct {
	IndicadorPagamento *string  `json:"indicador_pagamento"` // indPag
	FormaPagamento     *string  `json:"forma_pagamento"` // tPag
	DescricaoPagamento *string  `json:"descricao_pagamento"` // xPag
	ValorPagamento     *float64 `json:"valor_pagamento"` // vPag
	TipoIntegracao     *string  `json:"tipo_integracao"` // tpIntegra
	CnpjCredenciadora  *string  `json:"cnpj_credenciadora"` // CNPJ
	BandeiraOperadora  *string  `json:"bandeira_operadora"` // tBand
	NumeroAutorizacao  *string  `json:"numero_autorizacao"` // cAut
	ValorTroco         *float64 `json:"valor_troco"` // vTroco
}

type SAPReboque struct {
	Placa *string `json:"placa"`
	Uf    *string `json:"uf"`
	Rntc  *string `json:"rntc"`
	Vagao *string `json:"vagao"`
	Balsa *string `json:"balsa"`
}

type SAPVolume struct {
	// SAP/ABAP often sends quantidade as zero-padded string ("000000000000001").
	Quantidade  *StringOrFloat64 `json:"quantidade"`
	Especie     *string          `json:"especie"`
	Marca       *string          `json:"marca"`
	Numero      *string          `json:"numero"`
	PesoLiquido *float64         `json:"peso_liquido"`
	PesoBruto   *float64         `json:"peso_bruto"`
	Lacres      []SAPLacre       `json:"lacres,omitempty"`
}

type SAPLacre struct {
	Numero *string `json:"numero"`
}

type SAPObservacao struct {
	Campo *string `json:"campo"`
	Texto *string `json:"texto"`
}

type SAPProcessoReferenciado struct {
	Numero *string `json:"numero"`
	Origem *string `json:"origem"` // indProc
}

type SAPCanaFornecimento struct {
	Dia        *string  `json:"dia"`
	Quantidade *float64 `json:"quantidade"`
}

type SAPCanaDeducao struct {
	Codigo    *string  `json:"codigo"`
	Descricao *string  `json:"descricao"`
	Valor     *float64 `json:"valor"`
}

type SAPAgropecuarioDefensivo struct {
	NomeDefensivo *string `json:"nome_defensivo"`
}

// SAPItem represents each item/product line in the NF-e.
// CRITICAL: valor_unitario_comercial and valor_unitario_tributavel can be STRING in SAP contract.
type SAPItem struct {
	NumeroItem            *int     `json:"numero_item"`
	CodigoProduto         *string  `json:"codigo_produto"` // cProd
	CodigoBarrasComercial *string  `json:"codigo_barras_comercial"` // cEAN
	CodigoBarrasTributavel *string `json:"codigo_barras_tributavel"` // cEANTrib
	Descricao             *string  `json:"descricao"` // xProd
	CodigoNcm             *string  `json:"codigo_ncm"` // NCM
	Cest                  *string  `json:"cest"`
	CodigoExTipi          *string  `json:"codigo_ex_tipi"` // EXTIPI
	Cfop                  *string  `json:"cfop"`
	UnidadeComercial      *string  `json:"unidade_comercial"` // uCom
	QuantidadeComercial   *float64 `json:"quantidade_comercial"` // qCom
	// CRITICAL: Can be string "100.0000000" in SAP contract
	ValorUnitarioComercial *StringOrFloat64 `json:"valor_unitario_comercial"` // vUnCom
	ValorBruto             *float64         `json:"valor_bruto"` // vProd
	UnidadeTributavel      *string          `json:"unidade_tributavel"` // uTrib
	QuantidadeTributavel   *float64         `json:"quantidade_tributavel"` // qTrib
	// CRITICAL: Can be string
	ValorUnitarioTributavel *StringOrFloat64 `json:"valor_unitario_tributavel"` // vUnTrib
	ValorFrete              *float64         `json:"valor_frete"`
	ValorSeguro             *float64         `json:"valor_seguro"`
	ValorDesconto           *float64         `json:"valor_desconto"`
	ValorOutrasDespesas     *float64         `json:"valor_outras_despesas"`
	IncluiNoTotal           *string          `json:"inclui_no_total"` // indTot
	PedidoCompra            *string          `json:"pedido_compra"` // xPed
	NumeroItemPedidoCompra  *string          `json:"numero_item_pedido_compra"` // nItemPed
	NumeroFCI               *string          `json:"numero_fci"` // nFCI
	InformacoesAdicionaisItem *string        `json:"informacoes_adicionais_item"`

	// Tax fields (all at item level)
	IcmsOrigem                   *string  `json:"icms_origem"`
	IcmsCst                      *string  `json:"icms_cst"`
	IcmsCsosn                    *string  `json:"icms_csosn"`
	IcmsModalidade               *string  `json:"icms_modalidade"` // modBC
	IcmsBase                     *float64 `json:"icms_base"` // vBC
	IcmsAliquota                 *float64 `json:"icms_aliquota"` // pICMS
	IcmsValor                    *float64 `json:"icms_valor"` // vICMS
	IcmsFcpAliquota              *float64 `json:"icms_fcp_aliquota"` // pFCP
	IcmsFcpValor                 *float64 `json:"icms_fcp_valor"` // vFCP
	IcmsReducaoPercent           *float64 `json:"icms_reducao_percent"` // pRedBC
	IcmsMotivoDesoneracao        *string  `json:"icms_motivo_desoneracao"` // motDesICMS
	IcmsValorDesoneracao         *float64 `json:"icms_valor_desoneracao"` // vICMSDeson
	// ICMS CST 51 (diferimento)
	IcmsValorOperacao            *float64 `json:"icms_valor_operacao"`            // vICMSOp
	IcmsPercentualDiferimento    *float64 `json:"icms_percentual_diferimento"`    // pDif
	IcmsValorDiferido            *float64 `json:"icms_valor_diferido"`            // vICMSDif
	Cbenef                       *string  `json:"cbenef"`                        // cBenef
	// ICMS ST
	IcmsStModalidade             *string  `json:"icms_st_modalidade"` // modBCST
	IcmsStMvaAliquota            *float64 `json:"icms_st_mva_aliquota"` // pMVAST
	IcmsStReducaoPercent         *float64 `json:"icms_st_reducao_percent"` // pRedBCST
	IcmsStBase                   *float64 `json:"icms_st_base"` // vBCST
	IcmsStAliquota               *float64 `json:"icms_st_aliquota"` // pICMSST
	IcmsStValor                  *float64 `json:"icms_st_valor"` // vICMSST
	IcmsStFcpAliquota            *float64 `json:"icms_st_fcp_aliquota"` // pFCPST
	IcmsStFcpValor               *float64 `json:"icms_st_fcp_valor"` // vFCPST
	// IPI
	IpiCst                       *string  `json:"ipi_cst"`
	IpiEnquadramento             *string  `json:"ipi_enquadramento"`
	IpiBase                      *float64 `json:"ipi_base"` // vBC
	IpiAliquota                  *float64 `json:"ipi_aliquota"` // pIPI
	IpiValor                     *float64 `json:"ipi_valor"` // vIPI
	// PIS
	PisCst                       *string  `json:"pis_cst"`
	PisBase                      *float64 `json:"pis_base"` // vBC
	PisAliquota                  *float64 `json:"pis_aliquota"` // pPIS
	PisValor                     *float64 `json:"pis_valor"` // vPIS
	// COFINS
	CofinsCst                    *string  `json:"cofins_cst"`
	CofinsBase                   *float64 `json:"cofins_base"` // vBC
	CofinsAliquota               *float64 `json:"cofins_aliquota"` // pCOFINS
	CofinsValor                  *float64 `json:"cofins_valor"` // vCOFINS
	// Tax reform (NT 2025.002-RTC — IBS/CBS/IS)
	IbsCst                       *string  `json:"ibs_cst"`
	IbsCClassTrib                *string  `json:"ibs_c_class_trib"` // cClassTrib 6 digits
	IbsBase                      *float64 `json:"ibs_base"`
	IbsAliquota                  *float64 `json:"ibs_aliquota"`     // legacy single aliquot (prefer UF/Mun)
	IbsAliquotaUf                *float64 `json:"ibs_aliquota_uf"`  // pIBSUF
	IbsValorUf                   *float64 `json:"ibs_valor_uf"`     // vIBSUF
	IbsAliquotaMun               *float64 `json:"ibs_aliquota_mun"` // pIBSMun
	IbsValorMun                  *float64 `json:"ibs_valor_mun"`    // vIBSMun
	IbsValor                     *float64 `json:"ibs_valor"`        // vIBS (UF+Mun)
	CbsCst                       *string  `json:"cbs_cst"`
	CbsCClassTrib                *string  `json:"cbs_c_class_trib"` // usually same table as IBS
	CbsBase                      *float64 `json:"cbs_base"`
	CbsAliquota                  *float64 `json:"cbs_aliquota"`
	CbsValor                     *float64 `json:"cbs_valor"`
	IsCst                        *string  `json:"is_cst"`
	IsCClassTrib                 *string  `json:"is_c_class_trib"`
	IsBase                       *float64 `json:"is_base"`
	IsAliquota                   *float64 `json:"is_aliquota"`
	IsValor                      *float64 `json:"is_valor"`
	// Monofásico IBS/CBS (CST 620)
	IbsCbsQBcMono                *float64 `json:"ibscbs_q_bc_mono"`
	IbsCbsAdRemIbs               *float64 `json:"ibscbs_ad_rem_ibs"`
	IbsCbsVIbsMono               *float64 `json:"ibscbs_v_ibs_mono"`
	IbsCbsAdRemCbs               *float64 `json:"ibscbs_ad_rem_cbs"`
	IbsCbsVCbsMono               *float64 `json:"ibscbs_v_cbs_mono"`

	// Nested item arrays
	Nves               []SAPNve               `json:"nves,omitempty"`
	DocumentosImportacao []SAPDocumentoImportacao `json:"documentos_importacao,omitempty"`
	DetalhesExportacao []SAPDetalheExportacao `json:"detalhes_exportacao,omitempty"`
	Rastros            []SAPRastro            `json:"rastros,omitempty"`
	OrigensCombustivel []SAPOrigemCombustivel `json:"origens_combustivel,omitempty"`
	InfosCreditoPresumido []SAPCreditoPresumido `json:"infos_credito_presumido,omitempty"`
}

type SAPNve struct {
	Nve *string `json:"nve"`
}

type SAPDocumentoImportacao struct {
	NumeroDi            *string  `json:"numero_di"`
	DataDi              *string  `json:"data_di"` // date
	LocalDesembaraco    *string  `json:"local_desembaraco"`
	UfDesembaraco       *string  `json:"uf_desembaraco"`
	DataDesembaraco     *string  `json:"data_desembaraco"` // date
	CodigoTransporte    *string  `json:"codigo_transporte"`
	ValorAfrmm          *float64 `json:"valor_afrmm"`
	CodigoIntermediacao *string  `json:"codigo_intermediacao"`
	CnpjExportador      *string  `json:"cnpj_exportador"`
	UfExportador        *string  `json:"uf_exportador"`
	LocalExportador     *string  `json:"local_exportador"`
	Adicoes             []SAPAdicao `json:"adicoes,omitempty"`
}

type SAPAdicao struct {
	NumeroAdicao     *int     `json:"numero_adicao"`
	SequenciaAdicao  *int     `json:"sequencia_adicao"`
	CodigoFabricante *string  `json:"codigo_fabricante"`
	ValorDesconto    *float64 `json:"valor_desconto"`
	NumeroDrawback   *string  `json:"numero_drawback"`
}

type SAPDetalheExportacao struct {
	NumeroDrawback      *string  `json:"numero_drawback"`
	NumeroRe            *string  `json:"numero_re"`
	ChaveNfeRecebida    *string  `json:"chave_nfe_recebida"`
	QuantidadeExportada *float64 `json:"quantidade_exportada"`
}

type SAPRastro struct {
	NumeroLote *string `json:"numero_lote"`
	// SAP/ABAP often sends quantidade_lote as string ("1.000 ").
	QuantidadeLote  *StringOrFloat64 `json:"quantidade_lote"`
	DataFabricacao  *string          `json:"data_fabricacao"` // date
	DataValidade    *string          `json:"data_validade"`   // date
	CodigoAgregacao *string          `json:"codigo_agregacao"`
}

type SAPOrigemCombustivel struct {
	NumeroBomba  *string  `json:"numero_bomba"`
	NumeroBico   *string  `json:"numero_bico"`
	NumeroTanque *string  `json:"numero_tanque"`
	ValorInicial *float64 `json:"valor_inicial"`
	ValorFinal   *float64 `json:"valor_final"`
}

type SAPCreditoPresumido struct {
	CodigoCreditoPresumido *string  `json:"codigo_credito_presumido"` // cCredPres
	Base                   *float64 `json:"base"`
	PercentualPresumido    *float64 `json:"percentual_presumido"` // pCredPres
	ValorPresumido         *float64 `json:"valor_presumido"`     // vCredPres
}

// StringOrFloat64 handles the SAP contract returning unit prices / quantities as
// either float or string ("100.0000000", "1.000 ", "000000000000001").
type StringOrFloat64 struct {
	Value float64
}

func (s *StringOrFloat64) UnmarshalJSON(data []byte) error {
	if s == nil {
		return nil
	}
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) || bytes.Equal(trimmed, []byte(`""`)) {
		s.Value = 0
		return nil
	}
	// Try float first
	var f float64
	if err := json.Unmarshal(trimmed, &f); err == nil {
		s.Value = f
		return nil
	}
	// Try string (ABAP often pads / leaves trailing spaces)
	var str string
	if err := json.Unmarshal(trimmed, &str); err != nil {
		return err
	}
	str = strings.TrimSpace(str)
	if str == "" {
		s.Value = 0
		return nil
	}
	parsed, err := strconv.ParseFloat(str, 64)
	if err != nil {
		return err
	}
	s.Value = parsed
	return nil
}

func (s StringOrFloat64) MarshalJSON() ([]byte, error) {
	return json.Marshal(s.Value)
}

func (s *StringOrFloat64) ToFloat64Ptr() *float64 {
	if s == nil {
		return nil
	}
	v := s.Value
	return &v
}

// ParseSAPNFePayload parses the SAP JSON payload into the struct.
// Keys are lowercased and known ABAP truncated aliases are rewritten so real
// SAP payloads (UPPERCASE + short field names) match the Go/Python contract.
func ParseSAPNFePayload(payload []byte) (*SAPNFePayload, error) {
	normalized, err := NormalizeSAPNFeJSON(payload)
	if err != nil {
		return nil, domainerr.Validation("invalid_payload", "Failed to parse SAP NF-e JSON: "+err.Error())
	}
	var p SAPNFePayload
	if err := json.Unmarshal(normalized, &p); err != nil {
		return nil, domainerr.Validation("invalid_payload", "Failed to parse SAP NF-e JSON: "+err.Error())
	}
	return &p, nil
}

// ParseSAPNFePayloadNormalized is like ParseSAPNFePayload but also returns the
// normalized JSON that should be persisted for the nfe-gateway mapper.
func ParseSAPNFePayloadNormalized(payload []byte) (*SAPNFePayload, []byte, error) {
	normalized, err := NormalizeSAPNFeJSON(payload)
	if err != nil {
		return nil, nil, domainerr.Validation("invalid_payload", "Failed to parse SAP NF-e JSON: "+err.Error())
	}
	var p SAPNFePayload
	if err := json.Unmarshal(normalized, &p); err != nil {
		return nil, nil, domainerr.Validation("invalid_payload", "Failed to parse SAP NF-e JSON: "+err.Error())
	}
	return &p, normalized, nil
}

// ValidateSAPNFeOutbound ensures required fields are present for outbound NF-e.
func ValidateSAPNFeOutbound(p *SAPNFePayload) error {
	// Issuer document required
	if p.CnpjEmitente == nil || strings.TrimSpace(*p.CnpjEmitente) == "" {
		return domainerr.Validation("missing_issuer", "cnpj_emitente is required for outbound NF-e")
	}

	// Series and number required
	if p.Serie == nil || strings.TrimSpace(*p.Serie) == "" {
		return domainerr.Validation("missing_series", "serie is required for outbound NF-e")
	}
	if p.Numero == nil || strings.TrimSpace(*p.Numero) == "" {
		return domainerr.Validation("missing_number", "numero is required for outbound NF-e")
	}
	numeroDigits := strings.TrimLeft(strings.TrimSpace(*p.Numero), "0")
	if numeroDigits == "" {
		return domainerr.Validation("invalid_number", "numero must be between 1 and 999999999")
	}

	// Items required
	if len(p.Items) == 0 {
		return domainerr.Validation("missing_items", "items array cannot be empty for outbound NF-e")
	}

	// Recipient document required (cnpj or cpf)
	recipientOk := false
	if p.CnpjDestinatario != nil && strings.TrimSpace(*p.CnpjDestinatario) != "" {
		recipientOk = true
	}
	if p.CpfDestinatario != nil && strings.TrimSpace(*p.CpfDestinatario) != "" {
		recipientOk = true
	}
	if !recipientOk {
		return domainerr.Validation("missing_recipient", "cnpj_destinatario or cpf_destinatario is required for outbound NF-e")
	}

	for i, item := range p.Items {
		itemNo := i + 1
		if item.NumeroItem != nil && *item.NumeroItem > 0 {
			itemNo = *item.NumeroItem
		}
		if item.PisCst == nil || strings.TrimSpace(*item.PisCst) == "" {
			return domainerr.Validation("missing_pis_cst", fmt.Sprintf("item %d: pis_cst (ou pis_situacao_tributaria) é obrigatório", itemNo))
		}
		if item.CofinsCst == nil || strings.TrimSpace(*item.CofinsCst) == "" {
			return domainerr.Validation("missing_cofins_cst", fmt.Sprintf("item %d: cofins_cst (ou cofins_situacao_tributaria) é obrigatório", itemNo))
		}
	}

	return nil
}
