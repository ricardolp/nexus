package inbound

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/integration/sap"
)

func TestSAPPostingUnitPrefersPO(t *testing.T) {
	t.Parallel()
	if got := sapPostingUnit("EA", "PC"); got != "EA" {
		t.Fatalf("got %s", got)
	}
}

func TestSAPPostingUnitMapsNFPieceWhenPOMissing(t *testing.T) {
	t.Parallel()
	if got := sapPostingUnit("", "PC"); got != "EA" {
		t.Fatalf("got %s", got)
	}
	if got := sapPostingUnit("", "UN"); got != "EA" {
		t.Fatalf("got %s", got)
	}
}

func TestSAPPostingUnitKeepsNonPieceXML(t *testing.T) {
	t.Parallel()
	if got := sapPostingUnit("", "KG"); got != "KG" {
		t.Fatalf("got %s", got)
	}
}

func TestApplySAPPostingUnitsMapsPCWhenPOMissing(t *testing.T) {
	t.Parallel()
	refs := []sap.OrderRef{{
		PurchaseOrderNumber: "4504342501",
		PurchaseOrderItem:   "00010",
		Quantity:            208,
		Unit:                "PC",
		MaterialCode:        "40349805",
		NFItem:              1,
	}}
	applySAPPostingUnits(refs, nil)
	if refs[0].POUnit != "EA" {
		t.Fatalf("po unit %q", refs[0].POUnit)
	}
	if refs[0].Quantity != 208 {
		t.Fatalf("qty %v", refs[0].Quantity)
	}
}

func TestApplySAPPostingUnitsKeepsPOEA(t *testing.T) {
	t.Parallel()
	refs := []sap.OrderRef{{
		Quantity: 208,
		Unit:     "PC",
		POUnit:   "EA",
	}}
	applySAPPostingUnits(refs, nil)
	if refs[0].POUnit != "EA" {
		t.Fatalf("po unit %q", refs[0].POUnit)
	}
}
