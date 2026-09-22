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
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/integrationlog"
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
// ECC.
//
// Purchase-order search and subsequent postings (delivery / MIGO / MIRO) use
// the Nexus DOCUMENTS iFlow. Matching keeps GET {BaseURL}/http/Nexus/DOCUMENTS;
// later documents PUT the same endpoint with body.document =
// delivery | delivery_post | MIRO. Other adapter methods still use the
// spec §35 REST sub-paths when an iFlow exists for them.
//
// Authentication is HTTP Basic (ClientID:ClientSecret) unless TokenURL is
// set, in which case an OAuth2 client_credentials token is fetched and
// cached until near expiry.
type CPIClient struct {
	BaseURL        string
	ClientID       string
	ClientSecret   string
	TokenURL       string
	SAPClient      string
	SAPLanguage    string
	Headers        map[string]string
	Capabilities   integration.Capabilities
	OrganizationID uuid.UUID

	httpClient *http.Client

	tokenMu    sync.Mutex
	token      string
	tokenExpAt time.Time
}

func NewCPIClient(baseURL, clientID, clientSecret, tokenURL, sapClient, sapLanguage string, headers map[string]string, capabilities integration.Capabilities) *CPIClient {
	return NewCPIClientWithOrg(uuid.Nil, baseURL, clientID, clientSecret, tokenURL, sapClient, sapLanguage, headers, capabilities, nil)
}

// NewCPIClientWithOrg builds a CPI client that optionally records outbound HTTP
// exchanges for the organization integration log.
func NewCPIClientWithOrg(
	organizationID uuid.UUID,
	baseURL, clientID, clientSecret, tokenURL, sapClient, sapLanguage string,
	headers map[string]string,
	capabilities integration.Capabilities,
	recorder *integrationlog.Recorder,
) *CPIClient {
	transport := http.DefaultTransport
	if recorder != nil {
		transport = &integrationlog.RoundTripper{
			Base:        http.DefaultTransport,
			Recorder:    recorder,
			OrgID:       organizationID,
			Origin:      "nexus",
			Destination: "sap_cpi",
			SpanName:    "outbound.sap_cpi",
		}
	}
	return &CPIClient{
		BaseURL:        strings.TrimRight(baseURL, "/"),
		ClientID:       clientID,
		ClientSecret:   clientSecret,
		TokenURL:       tokenURL,
		SAPClient:      sapClient,
		SAPLanguage:    sapLanguage,
		Headers:        headers,
		Capabilities:   capabilities,
		OrganizationID: organizationID,
		httpClient:     &http.Client{Timeout: 30 * time.Second, Transport: transport},
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
		sinceDays = 1095
	}
	cutoffDate := time.Now().AddDate(0, 0, -sinceDays).Format("02-01-2006")

	endpoint, err := url.Parse(nexusDocumentsURL(c.BaseURL))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
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
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint.String(), nil)
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

	body, err := io.ReadAll(io.LimitReader(resp.Body, 20<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, parseAPIError(resp.StatusCode, body)
	}

	return parseNexusPurchaseOrders(body, in.PurchaseOrder)
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
	body, err := c.putDocuments(ctx, buildNexusDeliveryPayload(nexusDocumentDelivery, in.Number, in.Series, in.DocDate, in.Items, ""))
	if err != nil {
		return CreateInboundDeliveryResult{}, err
	}
	number := readDeliveryNumber(body)
	if number == "" {
		return CreateInboundDeliveryResult{}, &APIError{Code: "sap_error", Message: "SAP delivery response missing deliverynumber", Status: http.StatusUnprocessableEntity}
	}
	return CreateInboundDeliveryResult{DeliveryNumber: number}, nil
}

func (c *CPIClient) PostGoodsReceipt(ctx context.Context, in PostGoodsReceiptInput) (PostGoodsReceiptResult, error) {
	if !c.Capabilities.GoodsReceipt {
		return PostGoodsReceiptResult{}, ErrNotSupported
	}
	if in.ManualDocumentNumber != "" {
		return PostGoodsReceiptResult{MaterialDocumentNumber: in.ManualDocumentNumber}, nil
	}
	body, err := c.putDocuments(ctx, buildNexusDeliveryPayload(nexusDocumentDeliveryPost, in.Number, in.Series, in.DocDate, in.Items, in.DeliveryNumber))
	if err != nil {
		return PostGoodsReceiptResult{}, err
	}
	number := readMaterialDocument(body)
	if number == "" {
		return PostGoodsReceiptResult{}, &APIError{Code: "sap_error", Message: "SAP portaria response missing materialdocument", Status: http.StatusUnprocessableEntity}
	}
	return PostGoodsReceiptResult{MaterialDocumentNumber: number}, nil
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
	body, err := c.putDocuments(ctx, buildNexusMiroPayload(in))
	if err != nil {
		return PostSupplierInvoiceResult{}, err
	}
	invoice := readMiroInvoiceNumber(body)
	if invoice == "" {
		return PostSupplierInvoiceResult{}, &APIError{Code: "sap_error", Message: "SAP MIRO response missing invoice document number", Status: http.StatusUnprocessableEntity}
	}
	return PostSupplierInvoiceResult{
		InvoiceDocumentNumber:    invoice,
		AccountingDocumentNumber: readAccountingDocument(body),
	}, nil
}

func (c *CPIClient) PostAccountingDocument(ctx context.Context, in PostAccountingDocumentInput) (PostAccountingDocumentResult, error) {
	var out PostAccountingDocumentResult
	err := c.post(ctx, "/accounting-documents", in, &out)
	return out, err
}

func (c *CPIClient) putDocuments(ctx context.Context, body any) (map[string]any, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	endpoint, err := url.Parse(nexusDocumentsURL(c.BaseURL))
	if err != nil {
		return nil, err
	}
	q := endpoint.Query()
	if c.SAPClient != "" {
		q.Set("sap-client", c.SAPClient)
	}
	if c.SAPLanguage != "" {
		q.Set("sap-language", c.SAPLanguage)
	}
	endpoint.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, endpoint.String(), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
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
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, parseAPIError(resp.StatusCode, respBody)
	}
	if len(respBody) == 0 {
		return map[string]any{}, nil
	}
	var parsed map[string]any
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, err
	}
	if err := sapBodyError(parsed); err != nil {
		return nil, err
	}
	return parsed, nil
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
	var sapBody map[string]any
	if err := json.Unmarshal(body, &sapBody); err == nil {
		if msg := sapUserMessage(sapBody); msg != "" {
			return &APIError{Code: "sap_error", Message: msg, Status: status}
		}
	}
	code := "sap_error"
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		code = "authentication_failure"
	} else if status >= 500 {
		code = "sap_timeout"
	}
	return &APIError{Code: code, Message: string(body), Status: status}
}
