package fiscal

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestParseSAPNFePayload_RealABAPHomologPayload(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("caller")
	}
	fixture := filepath.Join(filepath.Dir(file), "..", "..", "test", "testdata", "fiscal", "sap_nfe_outbound_abap_real.json")
	raw, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	p, normalized, err := ParseSAPNFePayloadNormalized(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if err := ValidateSAPNFeOutbound(p); err != nil {
		t.Fatalf("validate: %v", err)
	}

	if p.Serie == nil || *p.Serie != "2" {
		t.Fatalf("serie=%v", p.Serie)
	}
	if p.Numero == nil || *p.Numero != "000069342" {
		t.Fatalf("numero=%v", p.Numero)
	}
	if p.CnpjEmitente == nil || *p.CnpjEmitente != "13677964000200" {
		t.Fatalf("emitente=%v", p.CnpjEmitente)
	}
	if p.CepEmitente == nil || *p.CepEmitente != "89248000" {
		t.Fatalf("cep emitente normalized=%v", p.CepEmitente)
	}
	if p.InscricaoEstadualDestinatario == nil || *p.InscricaoEstadualDestinatario != "4813864440020" {
		t.Fatalf("IE dest=%v", p.InscricaoEstadualDestinatario)
	}
	if len(p.Items) != 1 {
		t.Fatalf("items=%d", len(p.Items))
	}
	item := p.Items[0]
	if item.NumeroItem == nil || *item.NumeroItem != 1 {
		t.Fatalf("numero_item=%v", item.NumeroItem)
	}
	if item.IcmsCst == nil || *item.IcmsCst != "00" {
		t.Fatalf("icms_cst=%v", item.IcmsCst)
	}
	if item.IcmsBase == nil || *item.IcmsBase != 199111.83 {
		t.Fatalf("icms_base=%v", item.IcmsBase)
	}
	if item.IcmsModalidade == nil || *item.IcmsModalidade != "3" {
		t.Fatalf("icms_modalidade=%v", item.IcmsModalidade)
	}
	if item.PisCst == nil || *item.PisCst != "02" {
		t.Fatalf("pis_cst=%v", item.PisCst)
	}
	if item.PisBase == nil || *item.PisBase != 90938.35 {
		t.Fatalf("pis_base=%v", item.PisBase)
	}
	if item.PisAliquota == nil || *item.PisAliquota != 2 {
		t.Fatalf("pis_aliquota=%v", item.PisAliquota)
	}
	if item.CofinsCst == nil || *item.CofinsCst != "02" {
		t.Fatalf("cofins_cst=%v", item.CofinsCst)
	}
	if item.IpiCst == nil || *item.IpiCst != "51" {
		t.Fatalf("ipi_cst=%v", item.IpiCst)
	}
	if item.IbsCst == nil || *item.IbsCst != "000" {
		t.Fatalf("ibs_cst=%v", item.IbsCst)
	}
	if item.CbsCst == nil || *item.CbsCst != "000" {
		t.Fatalf("cbs_cst=%v", item.CbsCst)
	}
	if item.IbsCClassTrib == nil || *item.IbsCClassTrib != "000001" {
		t.Fatalf("ibs cClass=%v", item.IbsCClassTrib)
	}
	if item.IbsBase == nil || *item.IbsBase != 164669.56 {
		t.Fatalf("ibs_base=%v", item.IbsBase)
	}
	if item.IbsAliquotaUf == nil || *item.IbsAliquotaUf != 0.1 {
		t.Fatalf("ibs_aliquota_uf=%v", item.IbsAliquotaUf)
	}
	if item.CbsValor == nil || *item.CbsValor != 1482.03 {
		t.Fatalf("cbs_valor=%v", item.CbsValor)
	}
	if p.CodigoMunicipioFatoGerador == nil || *p.CodigoMunicipioFatoGerador != "4205803" {
		t.Fatalf("cMunFG filled=%v", p.CodigoMunicipioFatoGerador)
	}
	if p.ValorTotal == nil || *p.ValorTotal != 199111.83 {
		t.Fatalf("valor_total=%v", p.ValorTotal)
	}
	if p.ValorFrete == nil || *p.ValorFrete != 4703 {
		t.Fatalf("valor_frete=%v", p.ValorFrete)
	}
	if item.NumeroFCI == nil || *item.NumeroFCI != "0B7CFDF5-3198-4403-A2DA-5DE05609A406" {
		t.Fatalf("fci=%v", item.NumeroFCI)
	}
	if item.CodigoExTipi == nil || *item.CodigoExTipi != "001" {
		t.Fatalf("extipi=%v", item.CodigoExTipi)
	}
	if item.IncluiNoTotal == nil || *item.IncluiNoTotal != "1" {
		t.Fatalf("ind_total=%v", item.IncluiNoTotal)
	}
	if item.ValorFrete == nil || *item.ValorFrete != 4703 {
		t.Fatalf("item frete=%v", item.ValorFrete)
	}
	if len(item.Rastros) != 1 || item.Rastros[0].QuantidadeLote == nil || item.Rastros[0].QuantidadeLote.Value != 1 {
		t.Fatalf("rastro=%v", item.Rastros)
	}
	if len(p.Volumes) != 1 || p.Volumes[0].Quantidade == nil || p.Volumes[0].Quantidade.Value != 1 {
		t.Fatalf("volumes=%v", p.Volumes)
	}

	var check map[string]any
	if err := json.Unmarshal(normalized, &check); err != nil {
		t.Fatal(err)
	}
	items, _ := check["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("normalized items=%d", len(items))
	}
	it, _ := items[0].(map[string]any)
	if it["numero_item"] == nil {
		t.Fatalf("normalized item missing numero_item: %#v", it)
	}
}
