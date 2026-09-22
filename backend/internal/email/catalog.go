package email

// ProcessDef describes a configurable fiscal email process slot per company.
type ProcessDef struct {
	Code      string
	Label     string
	SortOrder int
}

// Catalog is the fixed list of email process templates per company.
var Catalog = []ProcessDef{
	{Code: "nfe_outbound", Label: "NF-e de saída (autorizada)", SortOrder: 10},
	{Code: "nfe_outbound_rejected", Label: "NF-e de saída (rejeitada)", SortOrder: 20},
	{Code: "nfe_cancel", Label: "Cancelamento", SortOrder: 30},
	{Code: "nfe_correction", Label: "Carta de correção", SortOrder: 40},
	{Code: "nfe_inbound", Label: "NF-e de entrada", SortOrder: 50},
	{Code: "nfse_outbound", Label: "NFS-e de saída", SortOrder: 60},
}

func processByCode(code string) (ProcessDef, bool) {
	for _, p := range Catalog {
		if p.Code == code {
			return p, true
		}
	}
	return ProcessDef{}, false
}

// TokenDef is a merge-field available in subject/body templates.
type TokenDef struct {
	Token       string `json:"token"`
	Description string `json:"description"`
}

var TokenCatalog = []TokenDef{
	{Token: "{{clientName}}", Description: "Nome do destinatário"},
	{Token: "{{destinatarioNome}}", Description: "Nome do destinatário"},
	{Token: "{{destinatarioEmail}}", Description: "E-mail do destinatário (XML)"},
	{Token: "{{emitenteNome}}", Description: "Nome do emitente"},
	{Token: "{{emitenteCnpj}}", Description: "CNPJ do emitente"},
	{Token: "{{numero}}", Description: "Número da nota"},
	{Token: "{{serie}}", Description: "Série da nota"},
	{Token: "{{chave}}", Description: "Chave de acesso"},
	{Token: "{{valor}}", Description: "Valor total da NF"},
	{Token: "{{dataEmissao}}", Description: "Data de emissão"},
	{Token: "{{empresaNome}}", Description: "Nome da empresa (CNPJ)"},
	{Token: "{{naturezaOperacao}}", Description: "Natureza da operação"},
}
