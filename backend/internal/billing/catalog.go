package billing

// Metric codes are stable identifiers in API payloads and grouping keys.
// Labels are Portuguese and intended for the extract UI/PDF.
const (
	MetricNFeOutbound     = "nfe_outbound"
	MetricNFeInboundSEFAZ = "nfe_inbound_sefaz"
	MetricNFeInboundXML   = "nfe_inbound_xml"
	MetricNFeInboundOther = "nfe_inbound_other"
	MetricNFeCancel       = "nfe_cancel"
	MetricNFeCorrection   = "nfe_correction_letter"
	MetricNFeAccept       = "nfe_operation_accept"
	MetricNFeReject       = "nfe_operation_reject"
	MetricNFeScience      = "nfe_operation_science"
	MetricNFeUnknown      = "nfe_operation_unknown"
	MetricNFSeOutbound    = "nfse_outbound"
	MetricNFSeInbound     = "nfse_inbound"
	MetricOther           = "other"

	SourceManualUpload   = "manual_upload"
	SourceNFeGatewayDist = "nfe_gateway_distribution"

	UnitMessage = "mensagem"
)

type MetricDef struct {
	Code       string
	Label      string
	AlwaysShow bool
	SortOrder  int
}

// Catalog is the billable-event list shown on the extract. AlwaysShow
// metrics appear even when the quantity is zero so the statement looks like
// a complete invoice rather than a sparse query result.
var Catalog = []MetricDef{
	{Code: MetricNFeOutbound, Label: "Notas fiscais de saída", AlwaysShow: true, SortOrder: 10},
	{Code: MetricNFeInboundSEFAZ, Label: "Notas fiscais de entrada (SEFAZ)", AlwaysShow: true, SortOrder: 20},
	{Code: MetricNFeInboundXML, Label: "Notas fiscais de entrada (XML manual)", AlwaysShow: true, SortOrder: 30},
	{Code: MetricNFeInboundOther, Label: "Notas fiscais de entrada (integração)", AlwaysShow: false, SortOrder: 35},
	{Code: MetricNFeCancel, Label: "Cancelamento", AlwaysShow: true, SortOrder: 40},
	{Code: MetricNFeCorrection, Label: "Carta de correção", AlwaysShow: true, SortOrder: 50},
	{Code: MetricNFeScience, Label: "Ciência da operação", AlwaysShow: true, SortOrder: 60},
	{Code: MetricNFeAccept, Label: "Aceite da operação", AlwaysShow: true, SortOrder: 70},
	{Code: MetricNFeReject, Label: "Rejeitar operação", AlwaysShow: true, SortOrder: 80},
	{Code: MetricNFeUnknown, Label: "Desconhecimento da operação", AlwaysShow: false, SortOrder: 90},
	{Code: MetricNFSeOutbound, Label: "NFS-e de saída", AlwaysShow: false, SortOrder: 100},
	{Code: MetricNFSeInbound, Label: "NFS-e de entrada", AlwaysShow: false, SortOrder: 110},
	{Code: MetricOther, Label: "Outros eventos", AlwaysShow: false, SortOrder: 900},
}

func metricByCode(code string) MetricDef {
	for _, m := range Catalog {
		if m.Code == code {
			return m
		}
	}
	return MetricDef{Code: code, Label: code, SortOrder: 800}
}
