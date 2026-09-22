package sap

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Subsequent postings (delivery / MIGO / MIRO) share the same Nexus iFlow as
// purchase-order search. The iFlow is selected by body `document`, not by a
// REST sub-path — posting to /inbound-deliveries hits Cloud Foundry 404.
const (
	nexusDocumentsPath = "/http/Nexus/DOCUMENTS"

	nexusDocumentDelivery     = "delivery"
	nexusDocumentDeliveryPost = "delivery_post"
	nexusDocumentMIRO         = "MIRO"
	nexusTypeMercadoria       = "MERCADORIA"
	nexusMiroDocType          = "RE"
	nexusMiroCurrency         = "BRL"
)

func nexusDocumentsURL(baseURL string) string {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return nexusDocumentsPath
	}
	parsed, err := url.Parse(base)
	if err != nil {
		return base
	}
	if strings.TrimRight(parsed.Path, "/") == "" {
		return base + nexusDocumentsPath
	}
	return base
}

func sapDocDate(t time.Time) string {
	if t.IsZero() {
		t = time.Now().UTC()
	}
	return t.UTC().Format("20060102")
}

func sapPOItem(item string) string {
	s := strings.TrimLeft(strings.TrimSpace(item), "0")
	if s == "" {
		s = "0"
	}
	for len(s) < 5 {
		s = "0" + s
	}
	return s
}

func jsonString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(t)
	case json.Number:
		return strings.TrimSpace(t.String())
	case float64:
		if t == 0 {
			return ""
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

func jsonStringFrom(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if s := jsonString(m[key]); s != "" {
			return s
		}
	}
	return ""
}

func jsonFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	default:
		return 0
	}
}

func samePONumber(a, b string) bool {
	na := strings.TrimLeft(strings.TrimSpace(a), "0")
	nb := strings.TrimLeft(strings.TrimSpace(b), "0")
	return na != "" && na == nb
}

func parseNexusPurchaseOrders(body []byte, wantPO string) ([]PurchaseOrder, error) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var raw any
	if err := dec.Decode(&raw); err != nil {
		return nil, err
	}
	var rows []any
	switch v := raw.(type) {
	case []any:
		rows = v
	case map[string]any:
		if s := asSlice(v["pedidos"]); len(s) > 0 {
			rows = s
		} else if s := asSlice(v["data"]); len(s) > 0 {
			rows = s
		} else {
			rows = []any{v}
		}
	default:
		return nil, nil
	}

	out := make([]PurchaseOrder, 0, len(rows))
	for _, row := range rows {
		m := asMap(row)
		if m == nil {
			continue
		}
		pedido := jsonStringFrom(m, "pedido", "PEDIDO", "purchaseOrder", "PurchaseOrder")
		if wantPO != "" && !samePONumber(pedido, wantPO) {
			continue
		}
		var items []PurchaseOrderItem
		for _, it := range asSlice(m["itens"]) {
			im := asMap(it)
			if im == nil {
				continue
			}
			items = append(items, PurchaseOrderItem{
				ItemNumber:   jsonStringFrom(im, "item", "ITEM"),
				MaterialCode: jsonStringFrom(im, "material", "MATERIAL"),
				Description:  jsonStringFrom(im, "descricao", "DESCRICAO"),
				Quantity:     jsonFloat(im["quantidade"]),
				Unit:         jsonStringFrom(im, "unidade", "UNIDADE"),
				UnitPrice:    jsonFloat(im["valorUnitario"]),
				Plant:        jsonStringFrom(im, "centro", "CENTRO"),
			})
		}
		out = append(out, PurchaseOrder{
			Number:     pedido,
			VendorCode: jsonStringFrom(m, "fornecedor", "FORNECEDOR"),
			Items:      items,
		})
	}
	return out, nil
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func asSlice(v any) []any {
	s, _ := v.([]any)
	return s
}

func collectSAPMessages(body map[string]any) []string {
	var out []string
	seen := map[string]struct{}{}
	push := func(msg string) {
		msg = strings.TrimSpace(msg)
		if msg == "" {
			return
		}
		if _, ok := seen[msg]; ok {
			return
		}
		seen[msg] = struct{}{}
		out = append(out, msg)
	}
	pushArray := func(arr []any) {
		for _, entry := range arr {
			if s, ok := entry.(string); ok {
				push(s)
				continue
			}
			if m := asMap(entry); m != nil {
				push(jsonStringFrom(m, "message", "MESSAGE", "msg", "MENSAGEM", "text", "TEXT"))
			}
		}
	}
	pushArray(asSlice(body["erros"]))
	pushArray(asSlice(body["ERROS"]))
	pushBAPI := func(arr []any) {
		for _, entry := range arr {
			m := asMap(entry)
			if m == nil {
				continue
			}
			t := strings.ToUpper(jsonStringFrom(m, "type", "TYPE", "Type", "msgty", "MSGTY", "msgtyp", "MSGTYP"))
			if t != "E" && t != "A" {
				continue
			}
			push(jsonStringFrom(m, "message", "MESSAGE", "msg", "MENSAGEM", "text", "TEXT"))
		}
	}
	pushBAPI(asSlice(body["message"]))
	pushBAPI(asSlice(body["MESSAGE"]))
	pushBAPI(asSlice(body["return"]))
	pushBAPI(asSlice(body["RETURN"]))
	return out
}

func sapUserMessage(body map[string]any) string {
	msgs := collectSAPMessages(body)
	if len(msgs) == 0 {
		if s, ok := body["message"].(string); ok {
			s = strings.TrimSpace(s)
			if s != "" {
				return s
			}
		}
		if s, ok := body["MESSAGE"].(string); ok {
			s = strings.TrimSpace(s)
			if s != "" {
				return s
			}
		}
	}
	var preferred []string
	for _, m := range msgs {
		if isGenericSAPWrapper(m) {
			continue
		}
		preferred = append(preferred, m)
	}
	if len(preferred) > 0 {
		return strings.Join(preferred, "; ")
	}
	return strings.Join(msgs, "; ")
}

func isGenericSAPWrapper(msg string) bool {
	l := strings.ToLower(msg)
	return strings.Contains(l, "tabela erros") ||
		strings.Contains(l, "delivery nao criada") ||
		strings.Contains(l, "delivery não criada")
}

func sapBodyError(body map[string]any) error {
	msg := sapUserMessage(body)
	if msg == "" {
		return nil
	}
	return &APIError{Code: "sap_error", Message: msg, Status: http.StatusUnprocessableEntity}
}

func firstFromList(body map[string]any, keys ...string) string {
	for _, key := range keys {
		for _, v := range asSlice(body[key]) {
			if s := jsonString(v); s != "" {
				return s
			}
		}
	}
	return ""
}

func readDeliveryNumber(body map[string]any) string {
	if n := firstFromList(body, "deliverynumbers", "deliveryNumbers", "DELIVERYNUMBERS"); n != "" {
		return n
	}
	return jsonStringFrom(body, "deliverynumber", "deliveryNumber", "DELIVERYNUMBER")
}

func readMaterialDocument(body map[string]any) string {
	return jsonStringFrom(body, "materialdocument", "MATERIALDOCUMENT", "materialDocument")
}

func readMiroInvoiceNumber(body map[string]any) string {
	keys := []string{
		"invoiceDocNumber", "INVOICEDOCNUMBER", "invoicedocument", "INVOICEDOCUMENT",
		"invoiceDocument", "miroNumber", "MIRONUMBER",
	}
	if n := jsonStringFrom(body, keys...); n != "" {
		return n
	}
	if result := asMap(body["RS_RESULT"]); result != nil {
		return jsonStringFrom(result, keys...)
	}
	if result := asMap(body["rs_result"]); result != nil {
		return jsonStringFrom(result, keys...)
	}
	return ""
}

func readAccountingDocument(body map[string]any) string {
	return jsonStringFrom(body, "accountingdocument", "accountingDocument", "ACCOUNTINGDOCUMENT")
}

type nexusPedidoLine struct {
	Pedido     string  `json:"pedido"`
	Item       string  `json:"item"`
	Quantidade float64 `json:"quantidade"`
	Unidade    string  `json:"unidade,omitempty"`
	NFUnit     string  `json:"nf_unit,omitempty"`
	Component  string  `json:"component,omitempty"`
}

type nexusDeliveryRequest struct {
	Document      string            `json:"document"`
	Numero        string            `json:"numero"`
	Serie         string            `json:"serie"`
	DataDoc       string            `json:"datadoc"`
	TipoDocumento string            `json:"tipo_documento"`
	PedidosCompra []nexusPedidoLine `json:"pedidoscompra"`
	Delivery      string            `json:"delivery,omitempty"`
}

func nexusPedidoLines(items []OrderRef) []nexusPedidoLine {
	out := make([]nexusPedidoLine, 0, len(items))
	for _, ref := range items {
		poUnit, nfUnit := sapUnits(ref)
		out = append(out, nexusPedidoLine{
			Pedido:     ref.PurchaseOrderNumber,
			Item:       sapPOItem(ref.PurchaseOrderItem),
			Quantidade: ref.Quantity,
			Unidade:    poUnit,
			NFUnit:     nfUnit,
			Component:  ref.MaterialCode,
		})
	}
	return out
}

func sapUnits(ref OrderRef) (poUnit, nfUnit string) {
	poUnit = strings.TrimSpace(ref.POUnit)
	if poUnit == "" {
		poUnit = canonicalSAPUnit(strings.TrimSpace(ref.Unit))
	}
	nfUnit = poUnit
	return poUnit, nfUnit
}

// canonicalSAPUnit maps NF commercial piece units (uCom PC/UN) to the SAP
// base that MM actually holds (EA). Used only when the PO line unit is unknown.
func canonicalSAPUnit(unit string) string {
	switch strings.ToUpper(strings.TrimSpace(unit)) {
	case "PC", "PCE", "PÇ", "UN":
		return "EA"
	default:
		return strings.TrimSpace(unit)
	}
}

func buildNexusDeliveryPayload(document, number, series string, docDate time.Time, items []OrderRef, delivery string) nexusDeliveryRequest {
	return nexusDeliveryRequest{
		Document:      document,
		Numero:        number,
		Serie:         series,
		DataDoc:       sapDocDate(docDate),
		TipoDocumento: nexusTypeMercadoria,
		PedidosCompra: nexusPedidoLines(items),
		Delivery:      strings.TrimSpace(delivery),
	}
}

type nexusMiroHeader struct {
	CompanyCode  string  `json:"company_code"`
	DocType      string  `json:"doc_type"`
	DocDate      string  `json:"doc_date"`
	PostingDate  string  `json:"posting_date"`
	Reference    string  `json:"reference"`
	GrossAmount  float64 `json:"gross_amount"`
	Currency     string  `json:"currency"`
	CalcTax      bool    `json:"calc_tax"`
	HeaderText   string  `json:"header_text"`
	PaymentTerms string  `json:"payment_terms"`
	BaselineDate string  `json:"baseline_date"`
	PartnerBank  string  `json:"partner_bank"`
	InvoiceInd   bool    `json:"invoice_ind"`
	Simulate     bool    `json:"simulate"`
}

type nexusMiroItem struct {
	PONumber   string  `json:"po_number"`
	POItem     string  `json:"po_item"`
	NFItem     string  `json:"nf_item"`
	Quantity   float64 `json:"quantity"`
	ItemAmount float64 `json:"item_amount"`
	TaxCode    string  `json:"tax_code"`
	POUnit     string  `json:"po_unit"`
	NFUnit     string  `json:"nf_unit"`
}

func (i nexusMiroItem) MarshalJSON() ([]byte, error) {
	return json.Marshal(map[string]any{
		"po_number":   i.PONumber,
		"po_item":     i.POItem,
		"nf_item":     i.NFItem,
		"quantity":    i.Quantity,
		"item_amount": i.ItemAmount,
		"tax_code":    i.TaxCode,
		"po_unit":     i.POUnit,
		"nf_unit":     i.NFUnit,
	})
}

type nexusMiroRequest struct {
	Document          string          `json:"document"`
	ProtocoloConsulta string          `json:"protocoloConsulta"`
	Header            nexusMiroHeader `json:"header"`
	Items             []nexusMiroItem `json:"items"`
}

func buildNexusMiroPayload(in PostSupplierInvoiceInput) nexusMiroRequest {
	currency := strings.TrimSpace(in.Currency)
	if currency == "" {
		currency = nexusMiroCurrency
	}
	docDate := sapDocDate(in.DocDate)
	firstPO := in.PurchaseOrderNumber
	if firstPO == "" && len(in.Items) > 0 {
		firstPO = in.Items[0].PurchaseOrderNumber
	}
	if firstPO == "" {
		firstPO = "SEMPO"
	}
	items := make([]nexusMiroItem, 0, len(in.Items))
	for _, ref := range in.Items {
		amount := ref.ItemAmount
		if amount == 0 {
			amount = ref.Quantity * ref.UnitPrice
		}
		nfItem := ""
		if ref.NFItem > 0 {
			nfItem = strconv.Itoa(ref.NFItem)
		}
		poUnit, nfUnit := sapUnits(ref)
		items = append(items, nexusMiroItem{
			PONumber:   ref.PurchaseOrderNumber,
			POItem:     sapPOItem(ref.PurchaseOrderItem),
			NFItem:     nfItem,
			Quantity:   ref.Quantity,
			ItemAmount: amount,
			POUnit:     poUnit,
			NFUnit:     nfUnit,
		})
	}
	return nexusMiroRequest{
		Document:          nexusDocumentMIRO,
		ProtocoloConsulta: "MIRO-" + firstPO + "-001",
		Header: nexusMiroHeader{
			CompanyCode:  in.CompanyCode,
			DocType:      nexusMiroDocType,
			DocDate:      docDate,
			PostingDate:  docDate,
			Reference:    strings.TrimSpace(in.Number) + "-" + strings.TrimSpace(in.Series),
			GrossAmount:  in.GrossAmount,
			Currency:     currency,
			CalcTax:      true,
			HeaderText:   in.AccessKey,
			BaselineDate: docDate,
			InvoiceInd:   true,
		},
		Items: items,
	}
}
