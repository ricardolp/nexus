package inbound

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
	"io"
	"strconv"
	"strings"
)

// ExtractedItem is a raw line extracted from the received payload, before
// any matching happens — the "original" view (spec §5.1).
type ExtractedItem struct {
	ItemNumber                    int
	SupplierMaterialCode          string
	Description                   string
	NCM                           string
	CFOP                          string
	Quantity                      float64
	Unit                          string
	UnitPrice                     float64
	TotalAmount                   float64
	PurchaseOrderReferenceRaw     string
	PurchaseOrderItemReferenceRaw string
	Taxes                         ItemTaxes
}

// ExtractItems parses line items out of the raw inbound payload. XML is the
// primary, well-defined path (standard NF-e det/prod elements, regardless
// of whether the root is nfeProc, NFe or a bare infNFe). JSON extraction is
// provisional — there is no confirmed real-world sample of what an inbound
// integration will send as JSON item data yet, so it follows the same
// snake_case convention already used for header fields (cnpj_emitente,
// serie, numero — see fiscal.extractNFeFromPayload) and should be revisited
// once a real payload is available.
func ExtractItems(payload []byte, contentType string) ([]ExtractedItem, error) {
	if isXML(contentType, payload) {
		return extractItemsFromXML(payload)
	}
	return extractItemsFromJSON(payload)
}

func isXML(contentType string, payload []byte) bool {
	ct := strings.ToLower(contentType)
	if strings.Contains(ct, "xml") {
		return true
	}
	trimmed := bytes.TrimSpace(payload)
	return bytes.HasPrefix(trimmed, []byte("<"))
}

type nfeXMLProd struct {
	CProd    string `xml:"cProd"`
	XProd    string `xml:"xProd"`
	NCM      string `xml:"NCM"`
	CFOP     string `xml:"CFOP"`
	UCom     string `xml:"uCom"`
	QCom     string `xml:"qCom"`
	VUnCom   string `xml:"vUnCom"`
	VProd    string `xml:"vProd"`
	XPed     string `xml:"xPed"`
	NItemPed string `xml:"nItemPed"`
}

type nfeXMLImposto struct {
	ICMS   nfeXMLInner `xml:"ICMS"`
	IPI    nfeXMLInner `xml:"IPI"`
	PIS    nfeXMLInner `xml:"PIS"`
	COFINS nfeXMLInner `xml:"COFINS"`
}

type nfeXMLDet struct {
	NItem   string        `xml:"nItem,attr"`
	Prod    nfeXMLProd    `xml:"prod"`
	Imposto nfeXMLImposto `xml:"imposto"`
}

// extractItemsFromXML scans tokens for <det> elements rather than binding to
// a fixed root (nfeProc>NFe>infNFe>det or NFe>infNFe>det or infNFe>det) —
// callers may send any of those depending on how far upstream unwrapped the
// envelope, and the item shape (det/prod) is stable across all of them.
func extractItemsFromXML(payload []byte) ([]ExtractedItem, error) {
	decoder := xml.NewDecoder(bytes.NewReader(payload))
	// NF-e XML has no external entities, but guard explicitly against XXE
	// regardless of decoder defaults.
	decoder.Strict = true
	decoder.Entity = map[string]string{}

	var items []ExtractedItem
	seq := 0
	for {
		tok, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "det" {
			continue
		}
		var det nfeXMLDet
		if err := decoder.DecodeElement(&det, &start); err != nil {
			return nil, err
		}
		seq++
		itemNumber := seq
		if n, err := strconv.Atoi(strings.TrimSpace(det.NItem)); err == nil && n > 0 {
			itemNumber = n
		}
		qty, _ := strconv.ParseFloat(strings.TrimSpace(det.Prod.QCom), 64)
		unitPrice, _ := strconv.ParseFloat(strings.TrimSpace(det.Prod.VUnCom), 64)
		total, _ := strconv.ParseFloat(strings.TrimSpace(det.Prod.VProd), 64)
		items = append(items, ExtractedItem{
			ItemNumber:                    itemNumber,
			SupplierMaterialCode:          strings.TrimSpace(det.Prod.CProd),
			Description:                   strings.TrimSpace(det.Prod.XProd),
			NCM:                           strings.TrimSpace(det.Prod.NCM),
			CFOP:                          strings.TrimSpace(det.Prod.CFOP),
			Quantity:                      qty,
			Unit:                          strings.TrimSpace(det.Prod.UCom),
			UnitPrice:                     unitPrice,
			TotalAmount:                   total,
			PurchaseOrderReferenceRaw:     strings.TrimSpace(det.Prod.XPed),
			PurchaseOrderItemReferenceRaw: strings.TrimSpace(det.Prod.NItemPed),
			Taxes: ItemTaxes{
				ICMS:   taxFromInner(det.Imposto.ICMS.Inner, "vICMS", "pICMS"),
				IPI:    taxFromInner(det.Imposto.IPI.Inner, "vIPI", "pIPI"),
				PIS:    taxFromInner(det.Imposto.PIS.Inner, "vPIS", "pPIS"),
				COFINS: taxFromInner(det.Imposto.COFINS.Inner, "vCOFINS", "pCOFINS"),
			},
		})
	}
	return items, nil
}

type jsonItemPayload struct {
	Itens []struct {
		NumeroItem    *int    `json:"numero_item,omitempty"`
		CodProduto    string  `json:"cod_produto"`
		Descricao     string  `json:"descricao"`
		NCM           string  `json:"ncm"`
		CFOP          string  `json:"cfop"`
		Unidade       string  `json:"unidade"`
		Quantidade    float64 `json:"quantidade"`
		ValorUnitario float64 `json:"valor_unitario"`
		ValorTotal    float64 `json:"valor_total"`
		PedidoCompra  string  `json:"pedido_compra"`
		ItemPedido    string  `json:"item_pedido"`
	} `json:"itens"`
}

func extractItemsFromJSON(payload []byte) ([]ExtractedItem, error) {
	var parsed jsonItemPayload
	if err := json.Unmarshal(payload, &parsed); err != nil {
		// A payload without a recognizable "itens" array (e.g. header-only
		// JSON) is not an error here — item extraction is best-effort.
		return nil, nil
	}
	items := make([]ExtractedItem, 0, len(parsed.Itens))
	for i, raw := range parsed.Itens {
		itemNumber := i + 1
		if raw.NumeroItem != nil && *raw.NumeroItem > 0 {
			itemNumber = *raw.NumeroItem
		}
		items = append(items, ExtractedItem{
			ItemNumber:                    itemNumber,
			SupplierMaterialCode:          strings.TrimSpace(raw.CodProduto),
			Description:                   strings.TrimSpace(raw.Descricao),
			NCM:                           strings.TrimSpace(raw.NCM),
			CFOP:                          strings.TrimSpace(raw.CFOP),
			Quantity:                      raw.Quantidade,
			Unit:                          strings.TrimSpace(raw.Unidade),
			UnitPrice:                     raw.ValorUnitario,
			TotalAmount:                   raw.ValorTotal,
			PurchaseOrderReferenceRaw:     strings.TrimSpace(raw.PedidoCompra),
			PurchaseOrderItemReferenceRaw: strings.TrimSpace(raw.ItemPedido),
		})
	}
	return items, nil
}
