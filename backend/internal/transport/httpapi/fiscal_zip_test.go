package httpapi

import (
	"reflect"
	"testing"
	"time"

	"github.com/nexus/fiscal-messaging/internal/fiscal"
)

func TestFiscalZipFilenameUsesBrasiliaTime(t *testing.T) {
	now := time.Date(2026, 10, 16, 1, 30, 0, 0, time.UTC)
	if got, want := fiscalZipFilename(now), "notas_fiscais_20261015_223000.zip"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestUniqueZipEntryNames(t *testing.T) {
	downloads := []*fiscal.DocumentPayloadDownload{
		{Filename: "NFe1.xml"},
		{Filename: "NFe2.xml"},
		{Filename: "NFe1.xml"},
		{Filename: "NFe1.xml"},
	}
	want := []string{"NFe1.xml", "NFe2.xml", "NFe1-2.xml", "NFe1-3.xml"}
	if got := uniqueZipEntryNames(downloads); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v want %v", got, want)
	}
}
