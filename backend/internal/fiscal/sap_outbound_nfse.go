package fiscal

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

// SAPNFSePayload is the nested Portuguese JSON the origin system posts to
// Nexus for outbound NFS-e (prestador / tomador / servico). Unlike
// SAPNFePayload, which is flat at root, NFS-e is nested.
//
// Nexus is the messaging layer: receive the origin payload, persist it, and
// transmit to the municipal or national NFS-e authorizer. Optional fields
// (reforma, município, vias públicas) are kept so they survive storage even
// when unused by a given city.
type SAPNFSePayload struct {
	DataEmissao              *string       `json:"data_emissao,omitempty"`
	NaturezaOperacao         *string       `json:"natureza_operacao,omitempty"` // 1–6
	RegimeEspecialTributacao *string       `json:"regime_especial_tributacao,omitempty"`
	OptanteSimplesNacional   *FlexibleBool `json:"optante_simples_nacional,omitempty"`
	IncentivadorCultural     *FlexibleBool `json:"incentivador_cultural,omitempty"`

	SerieRPS  *string `json:"serie_rps,omitempty"`
	NumeroRPS *string `json:"numero_rps,omitempty"`

	CodigoObra *string `json:"codigo_obra,omitempty"`
	ART        *string `json:"art,omitempty"`

	NumeroNFSeSubstituido *string `json:"numero_nfse_substituido,omitempty"`
	NumeroRPSSubstituido  *string `json:"numero_rps_substituido,omitempty"`
	SerieRPSSubstituido   *string `json:"serie_rps_substituido,omitempty"`
	TipoRPSSubstituido    *string `json:"tipo_rps_substituido,omitempty"`
	// ChaveNFSeSubstituida is the 50-char national access key of the NFS-e being
	// replaced (DPS <subst><chSubstda>). Preferred over numero-only fields.
	ChaveNFSeSubstituida      *string `json:"chave_nfse_substituida,omitempty"`
	MotivoSubstituicao        *string `json:"motivo_substituicao,omitempty"`        // 01–05, 99
	JustificativaSubstituicao *string `json:"justificativa_substituicao,omitempty"` // required when motivo=99

	IndicadorDestinatario *string `json:"indicador_destinatario,omitempty"`
	ConsumidorFinal       *string `json:"consumidor_final,omitempty"`
	FinalidadeEmissao     *string `json:"finalidade_emissao,omitempty"`

	PercentualTotalTributosFed *float64 `json:"percentual_total_tributos_fed,omitempty"`
	PercentualTotalTributosEst *float64 `json:"percentual_total_tributos_est,omitempty"`
	PercentualTotalTributosMun *float64 `json:"percentual_total_tributos_mun,omitempty"`

	// EnviarEmailTomador is a Nexus UI flag (not part of the DPS). When false,
	// post-authorization email skips the customer address; company template
	// ToAddresses still apply.
	EnviarEmailTomador *FlexibleBool `json:"enviar_email_tomador,omitempty"`

	Prestador     SAPNFSePrestador      `json:"prestador"`
	Tomador       SAPNFSeTomador        `json:"tomador"`
	Servico       SAPNFSeServico        `json:"servico"`
	Intermediario *SAPNFSeIntermediario `json:"intermediario,omitempty"`
}

type SAPNFSePrestador struct {
	CNPJ               *string `json:"cnpj,omitempty"`
	InscricaoMunicipal *string `json:"inscricao_municipal,omitempty"`
	CodigoMunicipio    *string `json:"codigo_municipio,omitempty"`
}

type SAPNFSeTomador struct {
	CPF                *string          `json:"cpf,omitempty"`
	CNPJ               *string          `json:"cnpj,omitempty"`
	NIF                *string          `json:"nif,omitempty"`
	MotivoAusenciaNIF  *string          `json:"motivo_ausencia_nif,omitempty"`
	InscricaoMunicipal *string          `json:"inscricao_municipal,omitempty"`
	RazaoSocial        *string          `json:"razao_social,omitempty"`
	Telefone           *string          `json:"telefone,omitempty"`
	Email              *string          `json:"email,omitempty"`
	Endereco           *SAPNFSeEndereco `json:"endereco,omitempty"`
}

type SAPNFSeEndereco struct {
	Logradouro      *string `json:"logradouro,omitempty"`
	TipoLogradouro  *string `json:"tipo_logradouro,omitempty"`
	Numero          *string `json:"numero,omitempty"`
	Complemento     *string `json:"complemento,omitempty"`
	Bairro          *string `json:"bairro,omitempty"`
	CodigoMunicipio *string `json:"codigo_municipio,omitempty"`
	UF              *string `json:"uf,omitempty"`
	CEP             *string `json:"cep,omitempty"`
	CodigoPaisExt   *string `json:"codigo_pais_ext,omitempty"`
	CEPExt          *string `json:"cep_ext,omitempty"`
	NomeCidadeExt   *string `json:"nome_cidade_ext,omitempty"`
	RegiaoExt       *string `json:"regiao_ext,omitempty"`
}

type SAPNFSeServico struct {
	ValorServicos          *float64      `json:"valor_servicos,omitempty"`
	ValorDeducoes          *float64      `json:"valor_deducoes,omitempty"`
	ValorPIS               *float64      `json:"valor_pis,omitempty"`
	ValorCOFINS            *float64      `json:"valor_cofins,omitempty"`
	ValorINSS              *float64      `json:"valor_inss,omitempty"`
	ValorIR                *float64      `json:"valor_ir,omitempty"`
	ValorCSLL              *float64      `json:"valor_csll,omitempty"`
	ISSRetido              *FlexibleBool `json:"iss_retido,omitempty"`
	ValorISS               *float64      `json:"valor_iss,omitempty"`
	ValorISSRetido         *float64      `json:"valor_iss_retido,omitempty"`
	OutrasRetencoes        *float64      `json:"outras_retencoes,omitempty"`
	BaseCalculo            *float64      `json:"base_calculo,omitempty"`
	Aliquota               *float64      `json:"aliquota,omitempty"`
	DescontoIncondicionado *float64      `json:"desconto_incondicionado,omitempty"`
	DescontoCondicionado   *float64      `json:"desconto_condicionado,omitempty"`

	ItemListaServico          *string  `json:"item_lista_servico,omitempty"`
	CodigoCNAE                *string  `json:"codigo_cnae,omitempty"`
	CodigoTributarioMunicipio *string  `json:"codigo_tributario_municipio,omitempty"`
	CodigoTributacaoMunicipio *string  `json:"codigo_tributacao_municipio,omitempty"` // alias
	Discriminacao             *string  `json:"discriminacao,omitempty"`
	CodigoMunicipio           *string  `json:"codigo_municipio,omitempty"`
	PercentualTotalTributos   *float64 `json:"percentual_total_tributos,omitempty"`
	FonteTotalTributos        *string  `json:"fonte_total_tributos,omitempty"`

	CodigoNBS                     *string  `json:"codigo_nbs,omitempty"`
	CodigoIndicadorOperacao       *string  `json:"codigo_indicador_operacao,omitempty"`
	IbsCbsSituacaoTributaria      *string  `json:"ibs_cbs_situacao_tributaria,omitempty"`
	IbsCbsClassificacaoTributaria *string  `json:"ibs_cbs_classificacao_tributaria,omitempty"`
	IbsCbsClassificacaoTributar   *string  `json:"ibs_cbs_classificacao_tributar,omitempty"` // ABAP 30-char name
	IbsCbsBaseCalculo             *float64 `json:"ibs_cbs_base_calculo,omitempty"`
	IbsUFAliquota                 *float64 `json:"ibs_uf_aliquota,omitempty"`
	IbsMunAliquota                *float64 `json:"ibs_mun_aliquota,omitempty"`
	CbsAliquota                   *float64 `json:"cbs_aliquota,omitempty"`
	IbsUFValor                    *float64 `json:"ibs_uf_valor,omitempty"`
	IbsMunValor                   *float64 `json:"ibs_mun_valor,omitempty"`
	CbsValor                      *float64 `json:"cbs_valor,omitempty"`

	CodigoMunicipioIncidencia   *string  `json:"codigo_municipio_incidencia,omitempty"`
	SituacaoTributariaPisCofins *string  `json:"situacao_tributaria_pis_cofins,omitempty"`
	BaseCalculoPisCofins        *float64 `json:"base_calculo_pis_cofins,omitempty"`
	AliquotaPIS                 *float64 `json:"aliquota_pis,omitempty"`
	AliquotaCOFINS              *float64 `json:"aliquota_cofins,omitempty"`
	TipoRetencaoPisCofins       *string  `json:"tipo_retencao_pis_cofins,omitempty"`

	ViasPublicas         *int    `json:"vias_publicas,omitempty"`
	LogradouroPrestacao  *string `json:"logradouro_prestacao,omitempty"`
	NumeroPrestacao      *string `json:"numero_prestacao,omitempty"`
	ComplementoPrestacao *string `json:"complemento_prestacao,omitempty"`
	BairroPrestacao      *string `json:"bairro_prestacao,omitempty"`
	MunicipioPrestacao   *string `json:"municipio_prestacao,omitempty"`
	UFPrestacao          *string `json:"uf_prestacao,omitempty"`
	CEPPrestacao         *string `json:"cep_prestacao,omitempty"`
}

func (s SAPNFSeServico) CodigoTributario() string {
	if v := derefStr(s.CodigoTributarioMunicipio); v != "" {
		return v
	}
	return derefStr(s.CodigoTributacaoMunicipio)
}

func (s SAPNFSeServico) ClassificacaoTributaria() string {
	if v := derefStr(s.IbsCbsClassificacaoTributaria); v != "" {
		return v
	}
	return derefStr(s.IbsCbsClassificacaoTributar)
}

type SAPNFSeIntermediario struct {
	RazaoSocial        *string `json:"razao_social,omitempty"`
	CPF                *string `json:"cpf,omitempty"`
	CNPJ               *string `json:"cnpj,omitempty"`
	NIF                *string `json:"nif,omitempty"`
	MotivoAusenciaNIF  *string `json:"motivo_ausencia_nif,omitempty"`
	InscricaoMunicipal *string `json:"inscricao_municipal,omitempty"`
	CodigoMunicipio    *string `json:"codigo_municipio,omitempty"`
}

// SAPNFSeResult is the authorization/consulta/cancel status Nexus persists
// and returns through messaging (número da NFS-e, RPS, código de verificação).
type SAPNFSeResult struct {
	CNPJPrestador          *string        `json:"cnpj_prestador,omitempty"`
	Ref                    *string        `json:"ref,omitempty"`
	Status                 *string        `json:"status,omitempty"`
	Numero                 *string        `json:"numero,omitempty"`
	NumeroRPS              *string        `json:"numero_rps,omitempty"`
	SerieRPS               *string        `json:"serie_rps,omitempty"`
	TipoRPS                *string        `json:"tipo_rps,omitempty"`
	CodigoVerificacao      *string        `json:"codigo_verificacao,omitempty"`
	DataEmissao            *string        `json:"data_emissao,omitempty"`
	URL                    *string        `json:"url,omitempty"`
	CaminhoXMLNotaFiscal   *string        `json:"caminho_xml_nota_fiscal,omitempty"`
	CaminhoXMLCancelamento *string        `json:"caminho_xml_cancelamento,omitempty"`
	URLDanfse              *string        `json:"url_danfse,omitempty"`
	Codigo                 *string        `json:"codigo,omitempty"`
	Mensagem               *string        `json:"mensagem,omitempty"`
	Erros                  []SAPNFSeError `json:"erros,omitempty"`
}

type SAPNFSeError struct {
	Codigo   *string `json:"codigo,omitempty"`
	Mensagem *string `json:"mensagem,omitempty"`
	Correcao *string `json:"correcao,omitempty"`
}

type SAPNFSeCancelRequest struct {
	CMotivo       *string `json:"c_motivo,omitempty"`
	Justificativa *string `json:"justificativa,omitempty"`
}

// FlexibleBool accepts JSON booleans and the string flags SAP/ABAP emit
// ("true"/"false", "1"/"0", "X", "S"/"N"). Marshal always writes a JSON bool.
type FlexibleBool struct {
	Value bool
}

func (b *FlexibleBool) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if bytes.Equal(data, []byte("null")) {
		return nil
	}
	var asBool bool
	if err := json.Unmarshal(data, &asBool); err == nil {
		b.Value = asBool
		return nil
	}
	var asNum float64
	if err := json.Unmarshal(data, &asNum); err == nil {
		b.Value = asNum != 0
		return nil
	}
	var asString string
	if err := json.Unmarshal(data, &asString); err != nil {
		return err
	}
	switch strings.ToLower(strings.TrimSpace(asString)) {
	case "true", "1", "x", "s", "sim", "yes":
		b.Value = true
	default:
		b.Value = false
	}
	return nil
}

func (b FlexibleBool) MarshalJSON() ([]byte, error) {
	return strconv.AppendBool(nil, b.Value), nil
}

func (b *FlexibleBool) Bool() bool {
	if b == nil {
		return false
	}
	return b.Value
}

func ParseSAPNFSePayload(payload []byte) (*SAPNFSePayload, error) {
	var p SAPNFSePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, domainerr.Validation("invalid_payload", "Failed to parse SAP NFS-e JSON: "+err.Error())
	}
	return &p, nil
}

func ValidateSAPNFSeOutbound(p *SAPNFSePayload) error {
	if p == nil {
		return domainerr.Validation("invalid_payload", "NFS-e payload is required")
	}
	if derefStr(p.DataEmissao) == "" {
		return domainerr.Validation("missing_issue_date", "data_emissao is required for outbound NFS-e")
	}
	if derefStr(p.NaturezaOperacao) == "" {
		return domainerr.Validation("missing_natureza_operacao", "natureza_operacao is required for outbound NFS-e")
	}
	if derefStr(p.SerieRPS) == "" {
		return domainerr.Validation("missing_rps_series", "serie_rps is required for outbound NFS-e")
	}
	if derefStr(p.NumeroRPS) == "" {
		return domainerr.Validation("missing_rps_number", "numero_rps is required for outbound NFS-e")
	}
	if derefStr(p.Prestador.CNPJ) == "" {
		return domainerr.Validation("missing_issuer", "prestador.cnpj is required for outbound NFS-e")
	}
	if derefStr(p.Prestador.CodigoMunicipio) == "" && derefStr(p.Servico.CodigoMunicipio) == "" {
		return domainerr.Validation("missing_provider_municipality", "prestador.codigo_municipio or servico.codigo_municipio is required for outbound NFS-e")
	}
	tomadorOK := derefStr(p.Tomador.CNPJ) != "" || derefStr(p.Tomador.CPF) != "" || derefStr(p.Tomador.NIF) != ""
	if !tomadorOK {
		return domainerr.Validation("missing_tomador", "tomador.cnpj, tomador.cpf or tomador.nif is required for outbound NFS-e")
	}
	if p.Servico.ValorServicos == nil {
		return domainerr.Validation("missing_valor_servicos", "servico.valor_servicos is required for outbound NFS-e")
	}
	if derefStr(p.Servico.ItemListaServico) == "" {
		return domainerr.Validation("missing_item_lista_servico", "servico.item_lista_servico is required for outbound NFS-e")
	}
	if derefStr(p.Servico.Discriminacao) == "" {
		return domainerr.Validation("missing_discriminacao", "servico.discriminacao is required for outbound NFS-e")
	}
	if derefStr(p.Servico.CodigoMunicipio) == "" {
		return domainerr.Validation("missing_codigo_municipio", "servico.codigo_municipio is required for outbound NFS-e")
	}
	return nil
}

func extractNFSeFromPayload(payload []byte) NFSeExtension {
	p, err := ParseSAPNFSePayload(payload)
	if err != nil {
		return NFSeExtension{}
	}
	return nfseExtensionFromSAP(p)
}

func mergeNFSe(explicit *NFSeExtension, parsed NFSeExtension) *NFSeExtension {
	out := NFSeExtension{}
	if explicit != nil {
		out = *explicit
	}
	if out.MunicipalityCode == "" {
		out.MunicipalityCode = parsed.MunicipalityCode
	}
	if out.ProviderCode == "" {
		out.ProviderCode = parsed.ProviderCode
	}
	if out.RPSNumber == "" {
		out.RPSNumber = parsed.RPSNumber
	}
	if out.RPSSeries == "" {
		out.RPSSeries = parsed.RPSSeries
	}
	if out.IssuerCNPJ == "" {
		out.IssuerCNPJ = parsed.IssuerCNPJ
	}
	return &out
}

func nfseExtensionFromSAP(p *SAPNFSePayload) NFSeExtension {
	if p == nil {
		return NFSeExtension{}
	}
	municipio := derefStr(p.Prestador.CodigoMunicipio)
	if municipio == "" {
		municipio = derefStr(p.Servico.CodigoMunicipio)
	}
	return NFSeExtension{
		MunicipalityCode: municipio,
		RPSNumber:        derefStr(p.NumeroRPS),
		RPSSeries:        derefStr(p.SerieRPS),
		IssuerCNPJ:       derefStr(p.Prestador.CNPJ),
	}
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return strings.TrimSpace(*s)
}
