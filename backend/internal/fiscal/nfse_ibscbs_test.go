package fiscal

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/nexus/fiscal-messaging/internal/organization"
)

func TestEnrichNFSePayloadIBSCBSFillsMissingFieldsOnly(t *testing.T) {
	raw := []byte(`{"serie_rps":"1","servico":{"valor_servicos":1500.10,"item_lista_servico":"17.09","codigo_indicador_operacao":"100301"}}`)
	p, err := ParseSAPNFSePayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	d := organization.NFSeIBSCBSDefaults{CST: "000", ClassTrib: "000001", OperationIndicator: "999999"}
	out, filled, err := enrichNFSePayloadIBSCBS(p, raw, d, true, false)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(filled, ",") != "ibs_cbs_situacao_tributaria,ibs_cbs_classificacao_tributaria" {
		t.Fatalf("filled = %v", filled)
	}
	var got struct {
		Servico map[string]any `json:"servico"`
	}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatal(err)
	}
	if got.Servico["ibs_cbs_situacao_tributaria"] != "000" || got.Servico["ibs_cbs_classificacao_tributaria"] != "000001" {
		t.Fatalf("servico = %v", got.Servico)
	}
	// SAP value wins: cIndOp sent by SAP is untouched.
	if got.Servico["codigo_indicador_operacao"] != "100301" {
		t.Fatalf("cIndOp overwritten: %v", got.Servico["codigo_indicador_operacao"])
	}
	// Amounts are not re-rounded through float64.
	if !strings.Contains(string(out), `"valor_servicos":1500.10`) {
		t.Fatalf("amount changed: %s", out)
	}
	if derefStr(p.Servico.IbsCbsSituacaoTributaria) != "000" || p.Servico.ClassificacaoTributaria() != "000001" {
		t.Fatalf("struct not updated for persistence")
	}
}

func TestEnrichNFSePayloadIBSCBSNoopWithoutDefaults(t *testing.T) {
	raw := []byte(`{"servico":{"item_lista_servico":"17.09"}}`)
	p, _ := ParseSAPNFSePayload(raw)
	out, filled, err := enrichNFSePayloadIBSCBS(p, raw, organization.NFSeIBSCBSDefaults{}, true, true)
	if err != nil || len(filled) != 0 || string(out) != string(raw) {
		t.Fatalf("expected no-op, got filled=%v err=%v out=%s", filled, err, out)
	}
}

func TestParseTransmissionResultCarriesSefinIBSCBS(t *testing.T) {
	payload := []byte(`{"specversion":"1.0","organization_id":"0190e1b8-0000-7000-8000-000000000001",
	  "data":{"document_id":"0190e1b8-0000-7000-8000-000000000002","outcome":"authorized",
	  "ibscbs":{"cst":"000","c_class_trib":"000001","c_ind_op":"100301","v_bc":"500.00",
	  "p_ibs_uf":"0.10","v_ibs_uf":"0.50","v_ibs_mun":"0.00","v_ibs":"0.50","p_cbs":"0.90","v_cbs":"4.50","v_tot_nf":"500.00"}}}`)
	_, result, err := ParseTransmissionResult(payload)
	if err != nil {
		t.Fatal(err)
	}
	if result.IBSCBS.Empty() {
		t.Fatal("IBSCBS not decoded")
	}
	m := result.IBSCBS.WebhookMap()
	if m["cbs_valor"] != "4.50" || m["ibs_valor"] != "0.50" || m["fonte"] != "sefin" || m["base_calculo"] != "500.00" {
		t.Fatalf("webhook map = %v", m)
	}
	if _, ok := m["ibs_mun_aliquota"]; ok {
		t.Fatalf("empty fields must be omitted: %v", m)
	}
}

func TestTransmissionResultWithoutIBSCBSIsEmpty(t *testing.T) {
	var r TransmissionResult
	if !r.IBSCBS.Empty() {
		t.Fatal("nil IBSCBS must be Empty")
	}
}

func TestNumericOrEmpty(t *testing.T) {
	cases := []struct {
		in      string
		decimal bool
		want    string
	}{
		{"0.50", true, "0.50"},
		{" 12 ", true, "12"},
		{"-1.5", true, "-1.5"},
		{"1.2.3", true, ""},
		{"abc", true, ""},
		{"000001", false, "000001"},
		{"00.1", false, ""},
		{"", true, ""},
	}
	for _, c := range cases {
		if got := numericOrEmpty(c.in, c.decimal); got != c.want {
			t.Errorf("numericOrEmpty(%q,%v) = %q, want %q", c.in, c.decimal, got, c.want)
		}
	}
}
