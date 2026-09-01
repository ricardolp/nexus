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
