package inbound

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

// NFeDetails is the extra header payload stored in organization_nfe.metadata_json.
// Architecture keeps organization_nfe columns as a thin frontier (chave/série/
// número/CNPJs); names, address, nature of operation and tax totals live here.
type NFeDetails struct {
	Issuer            NFeParty   `json:"issuer"`
	Recipient         NFeParty   `json:"recipient"`
	NatureOfOperation string     `json:"nature_of_operation,omitempty"`
	OperationType     string     `json:"operation_type,omitempty"`
	Finality          string     `json:"finality,omitempty"`
	Totals            *NFeTotals `json:"totals,omitempty"`
}

type NFeParty struct {
	CNPJ      string      `json:"cnpj,omitempty"`
	CPF       string      `json:"cpf,omitempty"`
	LegalName string      `json:"legal_name,omitempty"`
	TradeName string      `json:"trade_name,omitempty"`
	IE        string      `json:"ie,omitempty"`
	IM        string      `json:"im,omitempty"`
	CRT       string      `json:"crt,omitempty"`
	Address   *NFeAddress `json:"address,omitempty"`
}

type NFeAddress struct {
	Street     string `json:"street,omitempty"`
	Number     string `json:"number,omitempty"`
	Complement string `json:"complement,omitempty"`
	District   string `json:"district,omitempty"`
	CityCode   string `json:"city_code,omitempty"`
	City       string `json:"city,omitempty"`
	UF         string `json:"uf,omitempty"`
	CEP        string `json:"cep,omitempty"`
	Phone      string `json:"phone,omitempty"`
}

type NFeTotals struct {
	Products float64 `json:"products"`
	Freight  float64 `json:"freight"`
	Insurance float64 `json:"insurance"`
	Discount float64 `json:"discount"`
	Other    float64 `json:"other"`
	NF       float64 `json:"nf"`
	ICMSBase float64 `json:"icms_base"`
	ICMS     float64 `json:"icms"`
	ICMSST   float64 `json:"icms_st"`
	FCP      float64 `json:"fcp"`
	IPI      float64 `json:"ipi"`
	PIS      float64 `json:"pis"`
	COFINS   float64 `json:"cofins"`
	II       float64 `json:"ii"`
}

// ItemTaxes is one organization_nfe_items.taxes_json object.
type ItemTaxes struct {
	ICMS   *ItemTax `json:"icms,omitempty"`
	IPI    *ItemTax `json:"ipi,omitempty"`
	PIS    *ItemTax `json:"pis,omitempty"`
	COFINS *ItemTax `json:"cofins,omitempty"`
}

func (t *ItemTaxes) Empty() bool {
	return t == nil || (t.ICMS == nil && t.IPI == nil && t.PIS == nil && t.COFINS == nil)
}

type ItemTax struct {
	CST    string  `json:"cst,omitempty"`
	CSOSN  string  `json:"csosn,omitempty"`
	Base   float64 `json:"base,omitempty"`
	Rate   float64 `json:"rate,omitempty"`
	Amount float64 `json:"amount,omitempty"`
}

func (t *ItemTax) Empty() bool {
	return t == nil || (t.CST == "" && t.CSOSN == "" && t.Base == 0 && t.Rate == 0 && t.Amount == 0)
}

func (d NFeDetails) Empty() bool {
	return d.Issuer.LegalName == "" && d.Recipient.LegalName == "" && d.Totals == nil && d.NatureOfOperation == ""
}

// NFeExtensionFromHeader maps the XML header (including complementary
// details) onto the fiscal envelope persisted by fiscal.Service.Receive.
func NFeExtensionFromHeader(h *NFeHeader) *fiscal.NFeExtension {
	if h == nil {
		return nil
	}
	ext := &fiscal.NFeExtension{
		AccessKey:         h.AccessKey,
		Series:            h.Series,
		Number:            h.Number,
		Model:             h.Model,
		IssuerCNPJ:        h.IssuerCNPJ,
		RecipientDocument: h.RecipientDocument,
		IssuedAt:          h.IssuedAt,
	}
	if !h.Details.Empty() {
		ext.MetadataJSON = mustJSONBytes(h.Details)
	}
	return ext
}

func mustJSONBytes(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{}`)
	}
	return b
}

func parseIssuedAt(dhEmi, dEmi string) *time.Time {
	raw := strings.TrimSpace(dhEmi)
	if raw == "" {
		raw = strings.TrimSpace(dEmi)
	}
	if raw == "" {
		return nil
	}
	layouts := []string{time.RFC3339, "2006-01-02T15:04:05-07:00", "2006-01-02T15:04:05", "2006-01-02"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			utc := t.UTC()
			return &utc
		}
	}
	return nil
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", "."))
	if s == "" {
		return 0
	}
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

type nfeXMLInner struct {
	Inner string `xml:",innerxml"`
}

func taxFromInner(inner, amountTag, rateTag string) *ItemTax {
	inner = strings.TrimSpace(inner)
	if inner == "" {
		return nil
	}
	t := &ItemTax{
		CST:    xmlChildText(inner, "CST"),
		CSOSN:  xmlChildText(inner, "CSOSN"),
		Base:   parseFloat(xmlChildText(inner, "vBC")),
		Rate:   parseFloat(xmlChildText(inner, rateTag)),
		Amount: parseFloat(xmlChildText(inner, amountTag)),
	}
	if t.Empty() {
		return nil
	}
	return t
}

func xmlChildText(inner, localName string) string {
	decoder := xml.NewDecoder(bytes.NewReader([]byte("<x>" + inner + "</x>")))
	decoder.Strict = true
	decoder.Entity = map[string]string{}
	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			return ""
		}
		if err != nil {
			return ""
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != localName {
			continue
		}
		var s string
		if err := decoder.DecodeElement(&s, &start); err != nil {
			return ""
		}
		return strings.TrimSpace(s)
	}
}

func partyFromXML(p nfeXMLParty) NFeParty {
	addr := p.EnderEmit
	if addr.empty() {
		addr = p.EnderDest
	}
	out := NFeParty{
		CNPJ:      strings.TrimSpace(p.CNPJ),
		CPF:       strings.TrimSpace(p.CPF),
		LegalName: strings.TrimSpace(p.XNome),
		TradeName: strings.TrimSpace(p.XFant),
		IE:        strings.TrimSpace(p.IE),
		IM:        strings.TrimSpace(p.IM),
		CRT:       strings.TrimSpace(p.CRT),
	}
	if !addr.empty() {
		a := &NFeAddress{
			Street:     strings.TrimSpace(addr.XLgr),
			Number:     strings.TrimSpace(addr.Nro),
			Complement: strings.TrimSpace(addr.XCpl),
			District:   strings.TrimSpace(addr.XBairro),
			CityCode:   strings.TrimSpace(addr.CMun),
			City:       strings.TrimSpace(addr.XMun),
			UF:         strings.TrimSpace(addr.UF),
			CEP:        strings.TrimSpace(addr.CEP),
			Phone:      strings.TrimSpace(addr.Fone),
		}
		out.Address = a
	}
	return out
}
