package inbound

import (
	"bytes"
	"encoding/xml"
	"io"
	"strings"
	"time"
)

// NFeHeader is the header data package fiscal needs to resolve the
// receiving company and record series/number/access key — extracted here
// (not in package fiscal) because it requires the same XML token-scanning
// ExtractItems already does, and fiscal.extractNFeFromPayload only
// understands the JSON shape used by the existing outbound/SAP integration.
type NFeHeader struct {
	AccessKey         string
	Series            string
	Number            string
	Model             string
	IssuerCNPJ        string
	RecipientDocument string
	IssuedAt          *time.Time
	Details           NFeDetails
}

type nfeXMLParty struct {
	CNPJ      string       `xml:"CNPJ"`
	CPF       string       `xml:"CPF"`
	XNome     string       `xml:"xNome"`
	XFant     string       `xml:"xFant"`
	IE        string       `xml:"IE"`
	IM        string       `xml:"IM"`
	CRT       string       `xml:"CRT"`
	EnderEmit nfeXMLAddr   `xml:"enderEmit"`
	EnderDest nfeXMLAddr   `xml:"enderDest"`
}

type nfeXMLAddr struct {
	XLgr    string `xml:"xLgr"`
	Nro     string `xml:"nro"`
	XCpl    string `xml:"xCpl"`
	XBairro string `xml:"xBairro"`
	CMun    string `xml:"cMun"`
	XMun    string `xml:"xMun"`
	UF      string `xml:"UF"`
	CEP     string `xml:"CEP"`
	Fone    string `xml:"fone"`
}

func (a nfeXMLAddr) empty() bool {
	return strings.TrimSpace(a.XLgr) == "" && strings.TrimSpace(a.XMun) == "" && strings.TrimSpace(a.UF) == ""
}

type nfeXMLIde struct {
	Serie  string `xml:"serie"`
	NNF    string `xml:"nNF"`
	Mod    string `xml:"mod"`
	NatOp  string `xml:"natOp"`
	DhEmi  string `xml:"dhEmi"`
	DEmi   string `xml:"dEmi"`
	TpNF   string `xml:"tpNF"`
	FinNFe string `xml:"finNFe"`
}

type nfeXMLICMSTot struct {
	VBC     string `xml:"vBC"`
	VICMS   string `xml:"vICMS"`
	VST     string `xml:"vST"`
	VFCP    string `xml:"vFCP"`
	VProd   string `xml:"vProd"`
	VFrete  string `xml:"vFrete"`
	VSeg    string `xml:"vSeg"`
	VDesc   string `xml:"vDesc"`
	VII     string `xml:"vII"`
	VIPI    string `xml:"vIPI"`
	VPIS    string `xml:"vPIS"`
	VCOFINS string `xml:"vCOFINS"`
	VOutro  string `xml:"vOutro"`
	VNF     string `xml:"vNF"`
}

type nfeXMLTotal struct {
	ICMSTot nfeXMLICMSTot `xml:"ICMSTot"`
}

type nfeXMLInfNFe struct {
	ID    string      `xml:"Id,attr"`
	Ide   nfeXMLIde   `xml:"ide"`
	Emit  nfeXMLParty `xml:"emit"`
	Dest  nfeXMLParty `xml:"dest"`
	Total nfeXMLTotal `xml:"total"`
}

// ExtractNFeHeader scans for the <infNFe> element regardless of how deep
// it is nested (nfeProc>NFe>infNFe, NFe>infNFe, or a bare infNFe root) —
// same root-agnostic approach as extractItemsFromXML. Returns nil, nil for
// non-XML payloads: JSON header extraction already exists in
// fiscal.extractNFeFromPayload.
func ExtractNFeHeader(payload []byte, contentType string) (*NFeHeader, error) {
	if !isXML(contentType, payload) {
		return nil, nil
	}

	decoder := xml.NewDecoder(bytes.NewReader(payload))
	decoder.Strict = true
	decoder.Entity = map[string]string{}

	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "infNFe" {
			continue
		}
		var inf nfeXMLInfNFe
		if err := decoder.DecodeElement(&inf, &start); err != nil {
			return nil, err
		}
		header := &NFeHeader{
			AccessKey:         accessKeyFromID(inf.ID),
			Series:            strings.TrimSpace(inf.Ide.Serie),
			Number:            strings.TrimSpace(inf.Ide.NNF),
			Model:             strings.TrimSpace(inf.Ide.Mod),
			IssuerCNPJ:        strings.TrimSpace(inf.Emit.CNPJ),
			RecipientDocument: firstNonEmpty(strings.TrimSpace(inf.Dest.CNPJ), strings.TrimSpace(inf.Dest.CPF)),
			IssuedAt:          parseIssuedAt(inf.Ide.DhEmi, inf.Ide.DEmi),
			Details: NFeDetails{
				Issuer:            partyFromXML(inf.Emit),
				Recipient:         partyFromXML(inf.Dest),
				NatureOfOperation: strings.TrimSpace(inf.Ide.NatOp),
				OperationType:     strings.TrimSpace(inf.Ide.TpNF),
				Finality:          strings.TrimSpace(inf.Ide.FinNFe),
			},
		}
		tot := inf.Total.ICMSTot
		if tot.VNF != "" || tot.VProd != "" {
			header.Details.Totals = &NFeTotals{
				Products:  parseFloat(tot.VProd),
				Freight:   parseFloat(tot.VFrete),
				Insurance: parseFloat(tot.VSeg),
				Discount:  parseFloat(tot.VDesc),
				Other:     parseFloat(tot.VOutro),
				NF:        parseFloat(tot.VNF),
				ICMSBase:  parseFloat(tot.VBC),
				ICMS:      parseFloat(tot.VICMS),
				ICMSST:    parseFloat(tot.VST),
				FCP:       parseFloat(tot.VFCP),
				IPI:       parseFloat(tot.VIPI),
				PIS:       parseFloat(tot.VPIS),
				COFINS:    parseFloat(tot.VCOFINS),
				II:        parseFloat(tot.VII),
			}
		}
		return header, nil
	}
}

// accessKeyFromID strips the "NFe" prefix from infNFe's Id attribute
// (format "NFe" + 44 digits per the SEFAZ schema).
func accessKeyFromID(id string) string {
	id = strings.TrimSpace(id)
	return strings.TrimPrefix(id, "NFe")
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
