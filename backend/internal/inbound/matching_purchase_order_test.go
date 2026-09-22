package inbound

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

func TestSameSAPItemIgnoresLeadingZeros(t *testing.T) {
	t.Parallel()
	if !sameSAPItem("00010", "10") {
		t.Fatal("expected 00010 and 10 to match")
	}
	if sameSAPItem("00010", "20") {
		t.Fatal("expected 00010 and 20 not to match")
	}
}

func TestFindPOLineMatchesPaddedItem(t *testing.T) {
	t.Parallel()
	orders := []sap.PurchaseOrder{{
		Number: "4504342501",
		Items: []sap.PurchaseOrderItem{{
			ItemNumber: "10",
			Unit:       "EA",
		}},
	}}
	po, line, found := findPOLine(orders, "4504342501", "00010", POReferenceLevelItem)
	if !found || po == nil || line == nil {
		t.Fatal("expected PO line 00010 to match SAP item 10")
	}
	if line.Unit != "EA" {
		t.Fatalf("unit %q", line.Unit)
	}
}
