// Package sap implements the SAP Adapter described in the fiscal inbound
// orchestrator spec (§34-36): the orchestrator never talks to SAP directly,
// it calls Adapter, which hides whether the actual transport is SAP CPI
// REST, OData, RFC/BAPI or IDoc.
package sap

import (
	"context"
	"errors"
)

// ErrNotSupported is returned by an Adapter method the current
// organization/company is not entitled to call (see Capabilities) — e.g.
// CreateServiceEntry when the integration's capabilities.serviceEntry is
// false. The orchestrator must treat this the same as a BLOCKED validation,
// never attempt the call and retry.
var ErrNotSupported = errors.New("sap: operation not supported for this organization")

// VendorResolution is the result of matching a fiscal issuer CNPJ against a
// SAP Business Partner / Vendor (spec §15).
type VendorResolution struct {
	Status     string `json:"status"` // MATCHED | NOT_FOUND | MULTIPLE_MATCH | BLOCKED | INACTIVE
	VendorCode string `json:"vendor_code,omitempty"`
	VendorName string `json:"vendor_name,omitempty"`
}

// MaterialResolution is the result of one material matching strategy
// (spec §18).
type MaterialResolution struct {
	Status       string `json:"status"` // MATCHED | NOT_FOUND | MULTIPLE_MATCH
	MaterialCode string `json:"material_code,omitempty"`
	Description  string `json:"description,omitempty"`
	Strategy     string `json:"strategy,omitempty"`
}

type PurchaseOrderItem struct {
	ItemNumber   string  `json:"item_number"`
	MaterialCode string  `json:"material_code"`
	Description  string  `json:"description"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	UnitPrice    float64 `json:"unit_price"`
	Plant        string  `json:"plant,omitempty"`
}

type PurchaseOrder struct {
	Number     string              `json:"number"`
	VendorCode string              `json:"vendor_code"`
	Items      []PurchaseOrderItem `json:"items"`
}

type SearchPurchaseOrdersInput struct {
	VendorCNPJ    string `json:"vendor_cnpj,omitempty"`
	BranchCNPJ    string `json:"branch_cnpj,omitempty"`    // the receiving company's own CNPJ (organization_companies.cnpj)
	PurchaseOrder string `json:"purchase_order,omitempty"` // optional: filters the results client-side by number
	SinceDays     int    `json:"since_days,omitempty"`
}

type CreatePurchaseOrderItemInput struct {
	MaterialCode string  `json:"material_code"`
	Description  string  `json:"description"`
	Quantity     float64 `json:"quantity"`
	Unit         string  `json:"unit"`
	UnitPrice    float64 `json:"unit_price"`
}

type CreatePurchaseOrderInput struct {
	VendorCode             string                         `json:"vendor_code"`
	CompanyCode            string                         `json:"company_code"`
	PurchaseOrderType      string                         `json:"purchase_order_type"`
	PurchasingOrganization string                         `json:"purchasing_organization"`
	PurchasingGroup        string                         `json:"purchasing_group"`
	Plant                  string                         `json:"plant"`
	Items                  []CreatePurchaseOrderItemInput `json:"items"`
}

type CreatePurchaseOrderResult struct {
	PurchaseOrderNumber string `json:"purchase_order_number"`
}

// OrderRef is a purchase-order line reference carried through delivery/goods
// receipt/invoice calls.
type OrderRef struct {
	PurchaseOrderNumber string  `json:"purchase_order_number"`
	PurchaseOrderItem   string  `json:"purchase_order_item"`
	MaterialCode        string  `json:"material_code,omitempty"`
	Quantity            float64 `json:"quantity"`
	UnitPrice           float64 `json:"unit_price"`
}

type CreateInboundDeliveryInput struct {
	PurchaseOrderNumber string     `json:"purchase_order_number"`
	Items               []OrderRef `json:"items"`
}

type CreateInboundDeliveryResult struct {
	DeliveryNumber string `json:"delivery_number"`
}

type PostGoodsReceiptInput struct {
	PurchaseOrderNumber  string     `json:"purchase_order_number"`
	DeliveryNumber       string     `json:"delivery_number,omitempty"` // empty when receipt_mode=DIRECT_GOODS_RECEIPT (no delivery step)
	MovementType         string     `json:"movement_type"`
	Items                []OrderRef `json:"items"`
	ManualDocumentNumber string     `json:"-"` // set when the user posted GR outside the platform (legacy "register-migo" pattern) — never sent to SAP
}

type PostGoodsReceiptResult struct {
	MaterialDocumentNumber string `json:"material_document_number"`
}

type CreateServiceEntryInput struct {
	PurchaseOrderNumber string     `json:"purchase_order_number"`
	Items               []OrderRef `json:"items"`
}

type CreateServiceEntryResult struct {
	ServiceEntrySheetNumber string `json:"service_entry_sheet_number"`
}

type PostSupplierInvoiceInput struct {
	PurchaseOrderNumber string     `json:"purchase_order_number"`
	GrossAmount         float64    `json:"gross_amount"`
	Currency            string     `json:"currency"`
	Items               []OrderRef `json:"items"`
}

type PostSupplierInvoiceResult struct {
	InvoiceDocumentNumber    string `json:"invoice_document_number"`
	AccountingDocumentNumber string `json:"accounting_document_number"`
}

type PostAccountingDocumentInput struct {
	SourceDocumentNumber string `json:"source_document_number"`
	SourceDocumentType   string `json:"source_document_type"` // goods_receipt | supplier_invoice
}

type PostAccountingDocumentResult struct {
	AccountingDocumentNumber string `json:"accounting_document_number"`
}

// Adapter is the boundary between the orchestrator and SAP. Implementations:
// CPIClient (real HTTP calls to SAP CPI) and StubClient (deterministic mock,
// used when no integration is configured for the organization/company).
type Adapter interface {
	ResolveVendor(ctx context.Context, cnpj string) (VendorResolution, error)
	ResolveMaterial(ctx context.Context, vendorCode, supplierMaterialCode string) (MaterialResolution, error)
	SearchPurchaseOrders(ctx context.Context, in SearchPurchaseOrdersInput) ([]PurchaseOrder, error)
	CreatePurchaseOrder(ctx context.Context, in CreatePurchaseOrderInput) (CreatePurchaseOrderResult, error)
	CreateInboundDelivery(ctx context.Context, in CreateInboundDeliveryInput) (CreateInboundDeliveryResult, error)
	PostGoodsReceipt(ctx context.Context, in PostGoodsReceiptInput) (PostGoodsReceiptResult, error)
	CreateServiceEntry(ctx context.Context, in CreateServiceEntryInput) (CreateServiceEntryResult, error)
	PostSupplierInvoice(ctx context.Context, in PostSupplierInvoiceInput) (PostSupplierInvoiceResult, error)
	PostAccountingDocument(ctx context.Context, in PostAccountingDocumentInput) (PostAccountingDocumentResult, error)
}
