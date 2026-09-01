package fiscal

import (
	"encoding/json"
	"strings"
)

// nfeJSONFields maps NFeExtension fields to the JSON keys used by known
// source systems to carry the same data inline in the document payload
// (e.g. SAP's own NFe representation: "serie", "numero", "cnpj_emitente").
// Extraction is best-effort: explicit fields sent in the request's "nfe"
// object always take precedence over anything parsed here.
type nfePayloadFields struct {
	Series     string `json:"serie"`
	Number     string `json:"numero"`
	IssuerCNPJ string `json:"cnpj_emitente"`
}

// extractNFeFromPayload attempts to read series/number/issuer_cnpj directly
// from a JSON document payload, so callers don't have to duplicate values
// they already send inline (e.g. SAP's outbound NFe JSON). It's a no-op
// (zero value) for non-JSON payloads or payloads missing these keys.
func extractNFeFromPayload(payload []byte) NFeExtension {
	var fields nfePayloadFields
	if err := json.Unmarshal(payload, &fields); err != nil {
		return NFeExtension{}
	}
	return NFeExtension{
		Series:     strings.TrimSpace(fields.Series),
		Number:     strings.TrimSpace(fields.Number),
		IssuerCNPJ: strings.TrimSpace(fields.IssuerCNPJ),
	}
}

// mergeNFe fills gaps in the explicitly provided NFe extension with values
// extracted from the payload. Explicit values always win.
func mergeNFe(explicit *NFeExtension, parsed NFeExtension) *NFeExtension {
	out := NFeExtension{}
	if explicit != nil {
		out = *explicit
	}
	if out.Series == "" {
		out.Series = parsed.Series
	}
	if out.Number == "" {
		out.Number = parsed.Number
	}
	if out.IssuerCNPJ == "" {
		out.IssuerCNPJ = parsed.IssuerCNPJ
	}
	if out.IssuedAt == nil {
		out.IssuedAt = parsed.IssuedAt
	}
	if len(out.MetadataJSON) == 0 {
		out.MetadataJSON = parsed.MetadataJSON
	}
	return &out
}
