package sap

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"
	"time"
)

// StubClient is a deterministic, in-memory Adapter used when no SAP
// integration is configured for an organization/company — mirrors the
// legacy StubSapInboundAdapter, letting the orchestrator model a full
// end-to-end flow (matching, validation, execution plan) without a real
// SAP connection.
type StubClient struct {
	counter *int64
}

func NewStubClient() *StubClient {
	seed := time.Now().UnixNano() % 1_000_000
	return &StubClient{counter: &seed}
}

func (s *StubClient) next(prefix string) string {
	n := atomic.AddInt64(s.counter, 1)
	return fmt.Sprintf("%s%010d", prefix, n)
}

func (s *StubClient) ResolveVendor(_ context.Context, cnpj string) (VendorResolution, error) {
	cnpj = strings.TrimSpace(cnpj)
	if cnpj == "" {
		return VendorResolution{Status: "NOT_FOUND"}, nil
	}
	return VendorResolution{
		Status:     "MATCHED",
		VendorCode: "V" + cnpj[max(0, len(cnpj)-6):],
		VendorName: "Stub Vendor " + cnpj,
	}, nil
}

func (s *StubClient) ResolveMaterial(_ context.Context, _ string, supplierMaterialCode string) (MaterialResolution, error) {
	supplierMaterialCode = strings.TrimSpace(supplierMaterialCode)
	if supplierMaterialCode == "" {
		return MaterialResolution{Status: "NOT_FOUND"}, nil
	}
	return MaterialResolution{
		Status:       "MATCHED",
		MaterialCode: "M-" + supplierMaterialCode,
		Description:  "Stub material for " + supplierMaterialCode,
		Strategy:     "supplier_material_code",
	}, nil
}

// SearchPurchaseOrders only resolves when a PO number is given directly —
// without one, it deliberately returns no results so scenarios exercising
// PO_NOT_FOUND/WAIT_USER/CREATE_PO paths behave predictably in tests.
func (s *StubClient) SearchPurchaseOrders(_ context.Context, in SearchPurchaseOrdersInput) ([]PurchaseOrder, error) {
	if strings.TrimSpace(in.PurchaseOrder) == "" {
		return nil, nil
	}
	return []PurchaseOrder{{
		Number:     in.PurchaseOrder,
		VendorCode: "V" + in.VendorCNPJ,
		Items: []PurchaseOrderItem{{
			ItemNumber:   "10",
			MaterialCode: "STUB-MAT-001",
			Description:  "Stub PO line",
			Quantity:     100,
			Unit:         "UN",
			UnitPrice:    10,
			Plant:        "0001",
		}},
	}}, nil
}

func (s *StubClient) CreatePurchaseOrder(_ context.Context, _ CreatePurchaseOrderInput) (CreatePurchaseOrderResult, error) {
	return CreatePurchaseOrderResult{PurchaseOrderNumber: s.next("45")}, nil
}

func (s *StubClient) CreateInboundDelivery(_ context.Context, _ CreateInboundDeliveryInput) (CreateInboundDeliveryResult, error) {
	return CreateInboundDeliveryResult{DeliveryNumber: s.next("18")}, nil
}

func (s *StubClient) PostGoodsReceipt(_ context.Context, in PostGoodsReceiptInput) (PostGoodsReceiptResult, error) {
	if in.ManualDocumentNumber != "" {
		return PostGoodsReceiptResult{MaterialDocumentNumber: in.ManualDocumentNumber}, nil
	}
	return PostGoodsReceiptResult{MaterialDocumentNumber: s.next("50")}, nil
}

func (s *StubClient) CreateServiceEntry(_ context.Context, _ CreateServiceEntryInput) (CreateServiceEntryResult, error) {
	return CreateServiceEntryResult{ServiceEntrySheetNumber: s.next("10")}, nil
}

func (s *StubClient) PostSupplierInvoice(_ context.Context, _ PostSupplierInvoiceInput) (PostSupplierInvoiceResult, error) {
	return PostSupplierInvoiceResult{
		InvoiceDocumentNumber:    s.next("51"),
		AccountingDocumentNumber: s.next("100000"),
	}, nil
}

func (s *StubClient) PostAccountingDocument(_ context.Context, _ PostAccountingDocumentInput) (PostAccountingDocumentResult, error) {
	return PostAccountingDocumentResult{AccountingDocumentNumber: s.next("100000")}, nil
}
