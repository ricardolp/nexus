package fiscal

import (
	"strings"
	"testing"
)

func TestExtractElementByLocalName(t *testing.T) {
	xml := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe123"/></NFe>
  <protNFe versao="4.00">
    <infProt>
      <nProt>142260000000001</nProt>
      <dhRecbto>2026-03-20T10:00:00-03:00</dhRecbto>
    </infProt>
  </protNFe>
</nfeProc>`)

	got, err := extractElementByLocalName(xml, "protNFe")
	if err != nil {
		t.Fatal(err)
	}
	out := string(got)
	if !strings.Contains(out, "<protNFe") || !strings.Contains(out, "</protNFe>") {
		t.Fatalf("unexpected extract: %s", out)
	}
	if !strings.Contains(out, "142260000000001") {
		t.Fatalf("missing protocol number: %s", out)
	}
	if strings.Contains(out, "<NFe>") {
		t.Fatalf("should not include NFe body: %s", out)
	}
}
