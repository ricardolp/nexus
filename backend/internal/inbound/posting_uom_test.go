package inbound

import "testing"

func TestPostingUnitAndQtyUsesAlternative(t *testing.T) {
	t.Parallel()
	unit := "PC"
	alt := "EA"
	qty := 3.8
	item := Item{Quantity: 3.8, Unit: &unit, AlternativeUnit: &alt, AlternativeQuantity: &qty}
	gotUnit, gotQty := item.PostingUnitAndQty()
	if gotUnit != "EA" || gotQty != 3.8 {
		t.Fatalf("got %s %v", gotUnit, gotQty)
	}
}

func TestPostingUnitAndQtyFallsBackToXML(t *testing.T) {
	t.Parallel()
	unit := "PC"
	item := Item{Quantity: 10, Unit: &unit}
	gotUnit, gotQty := item.PostingUnitAndQty()
	if gotUnit != "PC" || gotQty != 10 {
		t.Fatalf("got %s %v", gotUnit, gotQty)
	}
}

func TestOrderRefsForSeparatesPOAndNFUnit(t *testing.T) {
	t.Parallel()
	nf := "PC"
	po := "EA"
	poNumber := "4504342501"
	poItem := "00010"
	item := Item{
		ItemNumber:                  1,
		Quantity:                    208,
		Unit:                        &nf,
		TotalAmount:                 10275.2,
		ResolvedPurchaseOrderNumber: &poNumber,
		ResolvedPurchaseOrderItem:   &poItem,
		ResolvedPurchaseOrderUnit:   &po,
	}
	refs := orderRefsFor([]Item{item})
	if len(refs) != 1 {
		t.Fatalf("expected 1 ref, got %d", len(refs))
	}
	if refs[0].Unit != "PC" {
		t.Fatalf("nf unit %q", refs[0].Unit)
	}
	if refs[0].POUnit != "EA" {
		t.Fatalf("po unit %q", refs[0].POUnit)
	}
	if refs[0].Quantity != 208 {
		t.Fatalf("qty %v", refs[0].Quantity)
	}
}

func TestOrderRefsForUsesOperatorAlternativeAsPOUnit(t *testing.T) {
	t.Parallel()
	nf := "PC"
	alt := "EA"
	poNumber := "4504342501"
	item := Item{
		ItemNumber:                  1,
		Quantity:                    208,
		Unit:                        &nf,
		AlternativeUnit:             &alt,
		ResolvedPurchaseOrderNumber: &poNumber,
	}
	refs := orderRefsFor([]Item{item})
	if len(refs) != 1 {
		t.Fatalf("expected 1 ref, got %d", len(refs))
	}
	if refs[0].Unit != "PC" {
		t.Fatalf("nf unit %q", refs[0].Unit)
	}
	if refs[0].POUnit != "EA" {
		t.Fatalf("po unit %q", refs[0].POUnit)
	}
}
