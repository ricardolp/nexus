package organization

import "testing"

func TestConvertQuantitySameUnit(t *testing.T) {
	t.Parallel()
	got, err := ConvertQuantity(10, "PC", "pc", nil, "EA")
	if err != nil {
		t.Fatal(err)
	}
	if got != 10 {
		t.Fatalf("got %v", got)
	}
}

func TestConvertQuantityKGToEA(t *testing.T) {
	t.Parallel()
	uoms := []MaterialUOM{
		{AlternativeUnit: "EA", BaseUnit: "EA", Numerator: 1, Denominator: 1},
		{AlternativeUnit: "KG", BaseUnit: "EA", Numerator: 1.90, Denominator: 1},
	}
	got, err := ConvertQuantity(3.8, "KG", "EA", uoms, "EA")
	if err != nil {
		t.Fatal(err)
	}
	if got < 1.999 || got > 2.001 {
		t.Fatalf("got %v want 2", got)
	}
}

func TestConvertQuantityPCToUNViaBase(t *testing.T) {
	t.Parallel()
	uoms := []MaterialUOM{
		{AlternativeUnit: "EA", BaseUnit: "EA", Numerator: 1, Denominator: 1},
		{AlternativeUnit: "PC", BaseUnit: "EA", Numerator: 1, Denominator: 1},
		{AlternativeUnit: "UN", BaseUnit: "EA", Numerator: 1, Denominator: 1},
	}
	got, err := ConvertQuantity(5, "PC", "UN", uoms, "EA")
	if err != nil {
		t.Fatal(err)
	}
	if got != 5 {
		t.Fatalf("got %v", got)
	}
}

func TestConvertQuantityMissingUnit(t *testing.T) {
	t.Parallel()
	uoms := []MaterialUOM{
		{AlternativeUnit: "EA", BaseUnit: "EA", Numerator: 1, Denominator: 1},
	}
	_, err := ConvertQuantity(1, "PC", "EA", uoms, "EA")
	if err == nil {
		t.Fatal("expected uom_not_registered")
	}
}
