package inbound

import "testing"

func TestFilterAlnum(t *testing.T) {
	got := filterAlnum(" 3515.0804 1234-abc ")
	if got != "351508041234ABC" {
		t.Fatalf("filterAlnum: got %q", got)
	}
}

func TestFilterDigits(t *testing.T) {
	got := filterDigits("12.345.678/0001-90")
	if got != "12345678000190" {
		t.Fatalf("filterDigits: got %q", got)
	}
}

func TestClipFilter(t *testing.T) {
	if clipFilter("  19730  ") != "19730" {
		t.Fatalf("clipFilter trim")
	}
	long := make([]rune, 90)
	for i := range long {
		long[i] = 'a'
	}
	if got := clipFilter(string(long)); len([]rune(got)) != 80 {
		t.Fatalf("clipFilter max: %d", len([]rune(got)))
	}
}

func TestParseSearchFields(t *testing.T) {
	all := parseSearchFields("")
	if !all["number"] || !all["partner"] || !all["access_key"] {
		t.Fatalf("empty fields should default to all: %#v", all)
	}
	got := parseSearchFields("numero,chave")
	if !got["number"] || !got["access_key"] || got["partner"] {
		t.Fatalf("parseSearchFields: %#v", got)
	}
}
