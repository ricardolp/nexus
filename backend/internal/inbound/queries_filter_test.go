package inbound

import (
	"strings"
	"testing"
)

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

func TestParseDocumentNumberBound(t *testing.T) {
	empty, err := ParseDocumentNumberBound("  ")
	if err != nil || empty != nil {
		t.Fatalf("empty: %v %#v", err, empty)
	}
	n, err := ParseDocumentNumberBound("00012")
	if err != nil || n == nil || *n != 12 {
		t.Fatalf("padded: %v %#v", err, n)
	}
	if _, err := ParseDocumentNumberBound("12a"); err == nil {
		t.Fatal("expected invalid number")
	}
}

func TestApplyNumberRange(t *testing.T) {
	from := int64(12)
	to := int64(15)
	clause, args := applyNumberRange("where 1=1", nil, &from, &to)
	if len(args) != 2 || args[0] != int64(12) || args[1] != int64(15) {
		t.Fatalf("args: %#v", args)
	}
	if !strings.Contains(clause, ">= $1") || !strings.Contains(clause, "<= $2") {
		t.Fatalf("clause: %s", clause)
	}
	if !strings.Contains(clause, "s.rps_number") {
		t.Fatalf("clause should use the SAP number: %s", clause)
	}
}

func TestStatusGroupTotal(t *testing.T) {
	counts := DocumentListCounts{All: 10, ActionNeeded: 1, InProgress: 2, Completed: 6, Problem: 1}
	if statusGroupTotal("completed", counts) != 6 || statusGroupTotal("", counts) != 10 {
		t.Fatalf("totals: %d %d", statusGroupTotal("completed", counts), statusGroupTotal("", counts))
	}
	if statusGroupClause("in_progress") == "" || statusGroupClause("nope") != "" {
		t.Fatal("status group clause")
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
