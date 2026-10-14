// Package nfseprovider resolve para qual provedor municipal de NFS-e uma nota
// vai (SEFIN Nacional, IPM/Atende.Net, ...) e guarda as credenciais dos
// webservices municipais. O protocolo de cada provedor vive no nfe-gateway
// (nfe_gateway/nfse/providers/<code>); o Go só sabe rotear e o mínimo para
// cancelar. Ver docs/architecture/25_nfse_provedores_municipais.md.
package nfseprovider

import "strings"

const (
	CodeSefinNacional = "sefin_nacional"
	CodeIPM           = "ipm"
)

// Como o provedor identifica uma NFS-e emitida (para cancelar/consultar).
const (
	IdentifiesByAccessKey = "access_key"
	IdentifiesByNumber    = "number"
)

// Tipo de credencial que o gateway pede ao internal_api antes de chamar o provedor.
const (
	CredentialsNone  = "none"
	CredentialsBasic = "basic"
)

// Descriptor é tudo o que o backend precisa saber de um provedor. Para
// plugar um sistema municipal novo: adapter em
// nfe-gateway/src/nfe_gateway/nfse/providers/<code>/ + uma linha aqui +
// linha(s) em nfse_municipal_providers.
type Descriptor struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	IdentifiesBy string `json:"identifies_by"`
	Credentials  string `json:"credentials"`
}

var descriptors = map[string]Descriptor{
	CodeSefinNacional: {
		Code:         CodeSefinNacional,
		Name:         "Sistema Nacional NFS-e (SEFIN)",
		IdentifiesBy: IdentifiesByAccessKey,
		Credentials:  CredentialsNone,
	},
	CodeIPM: {
		Code:         CodeIPM,
		Name:         "IPM Atende.Net",
		IdentifiesBy: IdentifiesByNumber,
		Credentials:  CredentialsBasic,
	},
}

// NormalizeCode devolve o código em minúsculas; vazio vira sefin_nacional.
func NormalizeCode(code string) string {
	c := strings.ToLower(strings.TrimSpace(code))
	if c == "" {
		return CodeSefinNacional
	}
	return c
}

// Lookup devolve o descritor do provedor (código vazio = SEFIN Nacional).
func Lookup(code string) (Descriptor, bool) {
	d, ok := descriptors[NormalizeCode(code)]
	return d, ok
}

// Descriptors lista os provedores conhecidos pelo backend.
func Descriptors() []Descriptor {
	out := make([]Descriptor, 0, len(descriptors))
	for _, code := range []string{CodeSefinNacional, CodeIPM} {
		out = append(out, descriptors[code])
	}
	for code, d := range descriptors {
		if code != CodeSefinNacional && code != CodeIPM {
			out = append(out, d)
		}
	}
	return out
}
