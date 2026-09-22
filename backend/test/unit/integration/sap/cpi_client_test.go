package sap_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/integration"
	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

func TestCPIClient_ResolveVendor_Success(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/vendors/resolve" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") == "" {
			t.Fatal("expected Authorization header")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":      "MATCHED",
			"vendor_code": "10000123",
			"vendor_name": "ACME",
		})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "client-id", "client-secret", "", "100", "PT", nil, integration.Capabilities{})
	result, err := client.ResolveVendor(context.Background(), "12345678000199")
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "MATCHED" || result.VendorCode != "10000123" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestCPIClient_BusinessError(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"errors": []map[string]string{{"code": "PURCHASE_ORDER_NOT_FOUND", "message": "PO does not exist"}},
		})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "client-id", "client-secret", "", "", "", nil, integration.Capabilities{})
	_, err := client.SearchPurchaseOrders(context.Background(), sap.SearchPurchaseOrdersInput{
		PurchaseOrder: "4500012345",
		VendorCNPJ:    "11222333000181",
	})
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*sap.APIError)
	if !ok {
		t.Fatalf("expected *sap.APIError, got %T", err)
	}
	if apiErr.Code != "PURCHASE_ORDER_NOT_FOUND" {
		t.Fatalf("unexpected code %q", apiErr.Code)
	}
}

func TestCPIClient_CreateInboundDelivery_AllowedWhenCapabilityEnabled(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("unexpected method %s", r.Method)
		}
		if r.URL.Path != "/http/Nexus/DOCUMENTS" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["document"] != "delivery" {
			t.Fatalf("unexpected document %v", body["document"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"deliverynumber": "1800000123"})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	result, err := client.CreateInboundDelivery(context.Background(), sap.CreateInboundDeliveryInput{
		PurchaseOrderNumber: "4500000001",
		Number:              "19730",
		Series:              "2",
		Items: []sap.OrderRef{{
			PurchaseOrderNumber: "4500000001",
			PurchaseOrderItem:   "10",
			Quantity:            1,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.DeliveryNumber != "1800000123" {
		t.Fatalf("unexpected delivery number %q", result.DeliveryNumber)
	}
}

func TestCPIClient_PostGoodsReceipt_UsesDeliveryPost(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/http/Nexus/DOCUMENTS" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["document"] != "delivery_post" {
			t.Fatalf("unexpected document %v", body["document"])
		}
		if body["delivery"] != "1800000123" {
			t.Fatalf("unexpected delivery %v", body["delivery"])
		}
		lines, _ := body["pedidoscompra"].([]any)
		if len(lines) != 1 {
			t.Fatalf("expected 1 pedido line, got %d", len(lines))
		}
		line, _ := lines[0].(map[string]any)
		if line["unidade"] != "EA" {
			t.Fatalf("unexpected unidade %v", line["unidade"])
		}
		if line["nf_unit"] != "EA" {
			t.Fatalf("unexpected nf_unit %v", line["nf_unit"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"materialdocument": "5000000999"})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "310", "PT", nil, integration.DefaultCapabilities())
	result, err := client.PostGoodsReceipt(context.Background(), sap.PostGoodsReceiptInput{
		DeliveryNumber: "1800000123",
		Items:          []sap.OrderRef{{PurchaseOrderNumber: "4500000001", PurchaseOrderItem: "10", Quantity: 1, Unit: "PC", POUnit: "EA"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.MaterialDocumentNumber != "5000000999" {
		t.Fatalf("unexpected material document %q", result.MaterialDocumentNumber)
	}
}

func TestCPIClient_DoesNotDoubleDocumentsPath(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/http/Nexus/DOCUMENTS" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"deliverynumber": "1"})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL+"/http/Nexus/DOCUMENTS", "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	if _, err := client.CreateInboundDelivery(context.Background(), sap.CreateInboundDeliveryInput{
		Items: []sap.OrderRef{{PurchaseOrderNumber: "1", PurchaseOrderItem: "10", Quantity: 1}},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestCPIClient_CreateInboundDelivery_SAPBusinessError(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"deliverynumber":  "",
			"deliverynumbers": []any{},
			"erros": []map[string]any{{
				"type":    "E",
				"id":      "M7",
				"number":  394,
				"message": "Pedido 4504342501 00010 não contém chave de controle de confirmação",
			}},
			"message": []map[string]any{{
				"msgtyp":  "E",
				"message": "Delivery nao criada. Verifique a tabela ERROS do retorno.",
			}},
		})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	_, err := client.CreateInboundDelivery(context.Background(), sap.CreateInboundDeliveryInput{
		Items: []sap.OrderRef{{PurchaseOrderNumber: "4504342501", PurchaseOrderItem: "10", Quantity: 1}},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*sap.APIError)
	if !ok {
		t.Fatalf("expected *sap.APIError, got %T", err)
	}
	if apiErr.Message != "Pedido 4504342501 00010 não contém chave de controle de confirmação" {
		t.Fatalf("unexpected message %q", apiErr.Message)
	}
}

func TestCPIClient_PostGoodsReceipt_TopLevelMessage(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"message": "Unidade de medida da NF não informada para pedido 4504342501 item 00010.",
		})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	_, err := client.PostGoodsReceipt(context.Background(), sap.PostGoodsReceiptInput{
		Items: []sap.OrderRef{{PurchaseOrderNumber: "4504342501", PurchaseOrderItem: "10", Quantity: 1, Unit: "PC"}},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	apiErr, ok := err.(*sap.APIError)
	if !ok {
		t.Fatalf("expected *sap.APIError, got %T", err)
	}
	if apiErr.Message != "Unidade de medida da NF não informada para pedido 4504342501 item 00010." {
		t.Fatalf("unexpected message %q", apiErr.Message)
	}
}

func TestCPIClient_CreateInboundDelivery_BlockedWhenCapabilityDisabled(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("SAP should not be called when inbound delivery is disabled")
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.Capabilities{
		GoodsReceipt:    true,
		InboundDelivery: false,
	})
	_, err := client.CreateInboundDelivery(context.Background(), sap.CreateInboundDeliveryInput{})
	if err != sap.ErrNotSupported {
		t.Fatalf("expected ErrNotSupported, got %v", err)
	}
}

func TestCPIClient_PostSupplierInvoice_SendsNFUnit(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			t.Fatalf("unexpected method %s", r.Method)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["document"] != "MIRO" {
			t.Fatalf("unexpected document %v", body["document"])
		}
		items, _ := body["items"].([]any)
		if len(items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(items))
		}
		item, _ := items[0].(map[string]any)
		if item["nf_unit"] != "EA" {
			t.Fatalf("unexpected nf_unit %v", item["nf_unit"])
		}
		if item["po_unit"] != "EA" {
			t.Fatalf("unexpected po_unit %v", item["po_unit"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"invoiceDocNumber": "5100000123"})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	result, err := client.PostSupplierInvoice(context.Background(), sap.PostSupplierInvoiceInput{
		PurchaseOrderNumber: "4504342501",
		GrossAmount:         10,
		Items: []sap.OrderRef{{
			PurchaseOrderNumber: "4504342501",
			PurchaseOrderItem:   "10",
			Quantity:            1,
			Unit:                "PC",
			POUnit:              "EA",
			NFItem:              1,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.InvoiceDocumentNumber != "5100000123" {
		t.Fatalf("unexpected invoice %q", result.InvoiceDocumentNumber)
	}
}

func TestCPIClient_PostSupplierInvoice_MapsXMLPieceWhenPOUnitMissing(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		items, _ := body["items"].([]any)
		item, _ := items[0].(map[string]any)
		if item["po_unit"] != "EA" || item["nf_unit"] != "EA" {
			t.Fatalf("expected EA from XML PC, got po_unit=%v nf_unit=%v", item["po_unit"], item["nf_unit"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"invoiceDocNumber": "5100000999"})
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	if _, err := client.PostSupplierInvoice(context.Background(), sap.PostSupplierInvoiceInput{
		PurchaseOrderNumber: "4504342501",
		GrossAmount:         10275.2,
		Items: []sap.OrderRef{{
			PurchaseOrderNumber: "4504342501",
			PurchaseOrderItem:   "00010",
			Quantity:            208,
			Unit:                "PC",
			NFItem:              1,
		}},
	}); err != nil {
		t.Fatal(err)
	}
}

func TestCPIClient_SearchPurchaseOrders_PicksUnitFromRequestedPO(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("name") != "PurchaseOrders" {
			t.Fatalf("unexpected name %s", r.URL.Query().Get("name"))
		}
		_, _ = w.Write([]byte(`[
			{"pedido":"4504331882","fornecedor":"0000400348","itens":[{"item":10,"unidade":"KG","quantidade":1}]},
			{"pedido":4504342501,"fornecedor":"0000400348","itens":[{"item":10,"unidade":"EA","quantidade":208}]}
		]`))
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.DefaultCapabilities())
	pos, err := client.SearchPurchaseOrders(context.Background(), sap.SearchPurchaseOrdersInput{
		VendorCNPJ:    "11222333000181",
		PurchaseOrder: "4504342501",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 1 {
		t.Fatalf("expected 1 PO, got %d", len(pos))
	}
	if pos[0].Number != "4504342501" {
		t.Fatalf("unexpected PO %q", pos[0].Number)
	}
	if len(pos[0].Items) != 1 || pos[0].Items[0].Unit != "EA" {
		t.Fatalf("unexpected items %+v", pos[0].Items)
	}
}

func TestCPIClient_CapabilityGate(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("SAP should not be called when capability is disabled")
	}))
	defer server.Close()

	client := sap.NewCPIClient(server.URL, "id", "secret", "", "", "", nil, integration.Capabilities{ServiceEntry: false})
	_, err := client.CreateServiceEntry(context.Background(), sap.CreateServiceEntryInput{})
	if err != sap.ErrNotSupported {
		t.Fatalf("expected ErrNotSupported, got %v", err)
	}
}

func TestStubClient_DeterministicBehavior(t *testing.T) {
	t.Parallel()

	client := sap.NewStubClient()
	ctx := context.Background()

	vendor, err := client.ResolveVendor(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	if vendor.Status != "NOT_FOUND" {
		t.Fatalf("expected NOT_FOUND for empty cnpj, got %q", vendor.Status)
	}

	pos, err := client.SearchPurchaseOrders(ctx, sap.SearchPurchaseOrdersInput{VendorCNPJ: "12345678000199"})
	if err != nil {
		t.Fatal(err)
	}
	if len(pos) != 0 {
		t.Fatalf("expected no results without an explicit PO number, got %d", len(pos))
	}

	result, err := client.PostGoodsReceipt(ctx, sap.PostGoodsReceiptInput{ManualDocumentNumber: "5000999999"})
	if err != nil {
		t.Fatal(err)
	}
	if result.MaterialDocumentNumber != "5000999999" {
		t.Fatalf("expected manual override to be honored, got %q", result.MaterialDocumentNumber)
	}
}
