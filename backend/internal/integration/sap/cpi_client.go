package sap

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nexus/fiscal-messaging/internal/integration"
)

// APIError is a structured error returned by the SAP CPI middleware for a
// failed operation (business validation, authentication, etc.) — callers
// classify it for retry decisions (spec §38).
type APIError struct {
	Code    string
	Message string
	Status  int
}

func (e *APIError) Error() string {
	return fmt.Sprintf("sap cpi: %s (%s, http %d)", e.Message, e.Code, e.Status)
}

// CPIClient is the real Adapter implementation: a thin REST client against
// SAP CPI (SAP Cloud Integration), which in turn fans out to SAP S/4HANA or
// ECC. It exposes the operations suggested in spec §35 as sub-paths of
// BaseURL:
//
//	POST {BaseURL}/vendors/resolve
//	POST {BaseURL}/materials/resolve
//	POST {BaseURL}/purchase-orders/search
//	POST {BaseURL}/purchase-orders
//	POST {BaseURL}/inbound-deliveries
//	POST {BaseURL}/goods-receipts
//	POST {BaseURL}/service-entries
//	POST {BaseURL}/supplier-invoices
//	POST {BaseURL}/accounting-documents
//
// Authentication is HTTP Basic (ClientID:ClientSecret) unless TokenURL is
// set, in which case an OAuth2 client_credentials token is fetched and
// cached until near expiry.
type CPIClient struct {
	BaseURL      string
	ClientID     string
	ClientSecret string
	TokenURL     string
	SAPClient    string
	SAPLanguage  string
	Headers      map[string]string
	Capabilities integration.Capabilities

	httpClient *http.Client

	tokenMu    sync.Mutex
	token      string
	tokenExpAt time.Time
}

func NewCPIClient(baseURL, clientID, clientSecret, tokenURL, sapClient, sapLanguage string, headers map[string]string, capabilities integration.Capabilities) *CPIClient {
	return &CPIClient{
		BaseURL:      strings.TrimRight(baseURL, "/"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		TokenURL:     tokenURL,
		SAPClient:    sapClient,
		SAPLanguage:  sapLanguage,
		Headers:      headers,
		Capabilities: capabilities,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *CPIClient) ResolveVendor(ctx context.Context, cnpj string) (VendorResolution, error) {
	var out VendorResolution
	err := c.post(ctx, "/vendors/resolve", map[string]any{"cnpj": cnpj}, &out)
	return out, err
}

func (c *CPIClient) ResolveMaterial(ctx context.Context, vendorCode, supplierMaterialCode string) (MaterialResolution, error) {
	var out MaterialResolution
	err := c.post(ctx, "/materials/resolve", map[string]any{
		"vendor_code":            vendorCode,
		"supplier_material_code": supplierMaterialCode,
	}, &out)
	return out, err
}

// nexusPurchaseOrder/-Item mirror the real response shape of the "Nexus"
// custom CPI iFlow (GET {BaseURL}/http/Nexus/DOCUMENTS?...&name=PurchaseOrders),
// confirmed against a live capture from the actual LS Mtron CPI tenant —
// Portuguese field names, one flat array of full purchase orders (with
// resolved items and tax breakdown, which this adapter doesn't currently
// need and so doesn't map). This is a different shape entirely from the
// generic /purchase-orders/search{vendors,materials}/resolve REST design the
// rest of this client still uses for the other 8 operations (spec §35) —
// those remain unverified against a real endpoint.
type nexusPurchaseOrderItem struct {
	Item          int     `json:"item"`
	Material      string  `json:"material"`
	Descricao     string  `json:"descricao"`
	Centro        string  `json:"centro"`
	Unidade       string  `json:"unidade"`
	Quantidade    float64 `json:"quantidade"`
	ValorUnitario float64 `json:"valorUnitario"`
}

type nexusPurchaseOrder struct {
	Pedido     string                   `json:"pedido"`
	Fornecedor string                   `json:"fornecedor"`
	Itens      []nexusPurchaseOrderItem `json:"itens"`
}

// SearchPurchaseOrders queries the real "Nexus" CPI iFlow for every open
// purchase order from a given vendor to a given receiving company/branch
// within a lookback window — it has no by-PO-number filter server-side, so
// in.PurchaseOrder (when set) is applied client-side after the fetch.
func (c *CPIClient) SearchPurchaseOrders(ctx context.Context, in SearchPurchaseOrdersInput) ([]PurchaseOrder, error) {
	vendorCNPJ := digitsOnly(in.VendorCNPJ)
	if vendorCNPJ == "" {
		return nil, &APIError{Code: "vendor_cnpj_required", Message: "vendor CNPJ is required to search purchase orders", Status: http.StatusBadRequest}
	}
	sinceDays := in.SinceDays
	if sinceDays <= 0 {
		sinceDays = 365
	}
	cutoffDate := time.Now().AddDate(0, 0, -sinceDays).Format("02-01-2006")

	q := url.Values{}
	if c.SAPClient != "" {
		q.Set("sap-client", c.SAPClient)
	}
	if c.SAPLanguage != "" {
		q.Set("sap-language", c.SAPLanguage)
	}
	q.Set("document", vendorCNPJ)
	q.Set("branchCnpj", digitsOnly(in.BranchCNPJ))
	q.Set("cutoffDate", cutoffDate)
	q.Set("type", "MERCADORIA")
	q.Set("name", "PurchaseOrders")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/http/Nexus/DOCUMENTS?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	if err := c.authorize(ctx, req); err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, parseAPIError(resp.StatusCode, body)
	}

	var raw []nexusPurchaseOrder
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	out := make([]PurchaseOrder, 0, len(raw))
	for _, po := range raw {
		if in.PurchaseOrder != "" && po.Pedido != in.PurchaseOrder {
			continue
		}
		items := make([]PurchaseOrderItem, 0, len(po.Itens))
		for _, it := range po.Itens {
			items = append(items, PurchaseOrderItem{
				ItemNumber:   strconv.Itoa(it.Item),
				MaterialCode: it.Material,
				Description:  it.Descricao,
				Quantity:     it.Quantidade,
				Unit:         it.Unidade,
				UnitPrice:    it.ValorUnitario,
				Plant:        it.Centro,
			})
		}
		out = append(out, PurchaseOrder{Number: po.Pedido, VendorCode: po.Fornecedor, Items: items})
	}
	return out, nil
}

func (c *CPIClient) CreatePurchaseOrder(ctx context.Context, in CreatePurchaseOrderInput) (CreatePurchaseOrderResult, error) {
	if !c.Capabilities.AutomaticPurchaseOrder {
		return CreatePurchaseOrderResult{}, ErrNotSupported
	}
	var out CreatePurchaseOrderResult
	err := c.post(ctx, "/purchase-orders", in, &out)
	return out, err
}

func (c *CPIClient) CreateInboundDelivery(ctx context.Context, in CreateInboundDeliveryInput) (CreateInboundDeliveryResult, error) {
	if !c.Capabilities.InboundDelivery {
		return CreateInboundDeliveryResult{}, ErrNotSupported
	}
	var out CreateInboundDeliveryResult
	err := c.post(ctx, "/inbound-deliveries", in, &out)
	return out, err
}

func (c *CPIClient) PostGoodsReceipt(ctx context.Context, in PostGoodsReceiptInput) (PostGoodsReceiptResult, error) {
	if !c.Capabilities.GoodsReceipt {
		return PostGoodsReceiptResult{}, ErrNotSupported
	}
	var out PostGoodsReceiptResult
	err := c.post(ctx, "/goods-receipts", in, &out)
	return out, err
}

func (c *CPIClient) CreateServiceEntry(ctx context.Context, in CreateServiceEntryInput) (CreateServiceEntryResult, error) {
	if !c.Capabilities.ServiceEntry {
		return CreateServiceEntryResult{}, ErrNotSupported
	}
	var out CreateServiceEntryResult
	err := c.post(ctx, "/service-entries", in, &out)
	return out, err
}

func (c *CPIClient) PostSupplierInvoice(ctx context.Context, in PostSupplierInvoiceInput) (PostSupplierInvoiceResult, error) {
	if !c.Capabilities.SupplierInvoice {
		return PostSupplierInvoiceResult{}, ErrNotSupported
	}
	var out PostSupplierInvoiceResult
	err := c.post(ctx, "/supplier-invoices", in, &out)
	return out, err
}

func (c *CPIClient) PostAccountingDocument(ctx context.Context, in PostAccountingDocumentInput) (PostAccountingDocumentResult, error) {
	var out PostAccountingDocumentResult
	err := c.post(ctx, "/accounting-documents", in, &out)
	return out, err
}

func (c *CPIClient) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.SAPClient != "" {
		req.Header.Set("sap-client", c.SAPClient)
	}
	if c.SAPLanguage != "" {
		req.Header.Set("sap-language", c.SAPLanguage)
	}
	for k, v := range c.Headers {
		req.Header.Set(k, v)
	}
	if err := c.authorize(ctx, req); err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return err
	}

	if resp.StatusCode >= 400 {
		return parseAPIError(resp.StatusCode, respBody)
	}
	if len(respBody) == 0 || out == nil {
		return nil
	}
	return json.Unmarshal(respBody, out)
}

func (c *CPIClient) authorize(ctx context.Context, req *http.Request) error {
	if c.TokenURL == "" {
		basic := base64.StdEncoding.EncodeToString([]byte(c.ClientID + ":" + c.ClientSecret))
		req.Header.Set("Authorization", "Basic "+basic)
		return nil
	}
	token, err := c.oauthToken(ctx)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	return nil
}

func (c *CPIClient) oauthToken(ctx context.Context) (string, error) {
	c.tokenMu.Lock()
	defer c.tokenMu.Unlock()

	if c.token != "" && time.Now().Before(c.tokenExpAt) {
		return c.token, nil
	}

	form := strings.NewReader("grant_type=client_credentials&client_id=" + c.ClientID + "&client_secret=" + c.ClientSecret)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.TokenURL, form)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", &APIError{Code: "authentication_failure", Message: "OAuth token request failed", Status: resp.StatusCode}
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", &APIError{Code: "authentication_failure", Message: "OAuth response missing access_token", Status: resp.StatusCode}
	}

	c.token = parsed.AccessToken
	expiresIn := parsed.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 300
	}
	c.tokenExpAt = time.Now().Add(time.Duration(expiresIn)*time.Second - 30*time.Second)
	return c.token, nil
}

// digitsOnly strips everything but digits from a CNPJ before sending it to
// SAP — mirrors the legacy TS client (issuerCnpj.replace(/\D/g, "")), which
// the real Nexus CPI iFlow expects unformatted (no dots/slashes/dashes).
func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func parseAPIError(status int, body []byte) error {
	var parsed struct {
		Errors []struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && len(parsed.Errors) > 0 {
		return &APIError{Code: parsed.Errors[0].Code, Message: parsed.Errors[0].Message, Status: status}
	}
	code := "sap_error"
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		code = "authentication_failure"
	} else if status >= 500 {
		code = "sap_timeout"
	}
	return &APIError{Code: code, Message: string(body), Status: status}
}
