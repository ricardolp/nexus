package fiscal

import (
	"encoding/base64"
	"errors"
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/platform/domainerr"
)

func domainCode(err error) string {
	var de *domainerr.Error
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

func TestDecodeDanfePDF(t *testing.T) {
	pdf := []byte("%PDF-1.4\n%fake danfe\n")
	enc := base64.StdEncoding.EncodeToString(pdf)

	got, err := DecodeDanfePDF(enc)
	if err != nil || string(got) != string(pdf) {
		t.Fatalf("plain: got=%q err=%v", got, err)
	}
	if _, err := DecodeDanfePDF("data:application/pdf;base64," + enc); err != nil {
		t.Fatalf("data uri: %v", err)
	}
	if _, err := DecodeDanfePDF(enc[:10] + "\r\n" + enc[10:]); err != nil {
		t.Fatalf("with line breaks: %v", err)
	}

	cases := map[string]string{
		"":         "missing_pdf_base64",
		"@@@@":     "invalid_pdf_base64",
		base64.StdEncoding.EncodeToString([]byte("<xml/>")): "invalid_pdf",
	}
	for in, code := range cases {
		if _, err := DecodeDanfePDF(in); domainCode(err) != code {
			t.Fatalf("input %q: err=%v, want %s", in, err, code)
		}
	}

	big := base64.StdEncoding.EncodeToString([]byte("%PDF" + strings.Repeat("a", MaxDanfePDFBytes)))
	if _, err := DecodeDanfePDF(big); domainCode(err) != "danfe_too_large" {
		t.Fatalf("big: err=%v, want danfe_too_large", err)
	}
}

func TestEventResponseSuffix(t *testing.T) {
	cases := []struct {
		kind       string
		seq        int
		wantType   string
		wantSuffix string
	}{
		{"cancel", 1, PayloadCancelResponse, ".cancel_response.xml"},
		{"cce", 1, PayloadCceResponse, ".cce_response.xml"},
		{"cce", 3, PayloadCceResponse, ".cce_3_response.xml"},
	}
	for _, tc := range cases {
		typ, suffix, err := eventResponseSuffix(tc.kind, tc.seq)
		if err != nil || typ != tc.wantType || suffix != tc.wantSuffix {
			t.Fatalf("%s/%d: got %s %s %v", tc.kind, tc.seq, typ, suffix, err)
		}
	}
	if _, _, err := eventResponseSuffix("inutilization", 1); domainCode(err) != "invalid_event_type" {
		t.Fatalf("inutilization: err=%v", err)
	}
}
