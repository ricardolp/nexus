package inbound_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/inbound"
)

const sampleNFeXML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe>
      <det nItem="1">
        <prod>
          <cProd>ABC001</cProd>
          <xProd>CHAPA DE ACO</xProd>
          <NCM>72085100</NCM>
          <CFOP>5102</CFOP>
          <uCom>KG</uCom>
          <qCom>100.0000</qCom>
          <vUnCom>18.00</vUnCom>
          <vProd>1800.00</vProd>
          <xPed>4500012345</xPed>
          <nItemPed>000010</nItemPed>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>XYZ002</cProd>
          <xProd>PARAFUSO</xProd>
          <NCM>73181500</NCM>
          <CFOP>5102</CFOP>
          <uCom>UN</uCom>
          <qCom>50.0000</qCom>
          <vUnCom>0.50</vUnCom>
          <vProd>25.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`

func TestExtractItems_XML(t *testing.T) {
	t.Parallel()

	items, err := inbound.ExtractItems([]byte(sampleNFeXML), "application/xml")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	first := items[0]
	if first.ItemNumber != 1 || first.SupplierMaterialCode != "ABC001" || first.Quantity != 100 || first.UnitPrice != 18 {
		t.Fatalf("unexpected first item: %+v", first)
	}
	if first.PurchaseOrderReferenceRaw != "4500012345" || first.PurchaseOrderItemReferenceRaw != "000010" {
		t.Fatalf("expected PO reference to be extracted, got %+v", first)
	}

	second := items[1]
	if second.ItemNumber != 2 || second.PurchaseOrderReferenceRaw != "" {
		t.Fatalf("expected second item without PO reference, got %+v", second)
	}
}

func TestExtractItems_XML_DetectedWithoutContentType(t *testing.T) {
	t.Parallel()

	items, err := inbound.ExtractItems([]byte(sampleNFeXML), "")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected sniffing to detect XML by leading '<', got %d items", len(items))
	}
}

func TestExtractItems_JSON(t *testing.T) {
	t.Parallel()

	payload := []byte(`{
		"itens": [
			{"cod_produto":"ABC001","descricao":"CHAPA DE ACO","quantidade":100,"valor_unitario":18,"pedido_compra":"4500012345","item_pedido":"000010"},
			{"cod_produto":"XYZ002","descricao":"PARAFUSO","quantidade":50,"valor_unitario":0.5}
		]
	}`)

	items, err := inbound.ExtractItems(payload, "application/json")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}
	if items[0].ItemNumber != 1 || items[0].PurchaseOrderReferenceRaw != "4500012345" {
		t.Fatalf("unexpected first item: %+v", items[0])
	}
	if items[1].ItemNumber != 2 || items[1].PurchaseOrderReferenceRaw != "" {
		t.Fatalf("unexpected second item: %+v", items[1])
	}
}

func TestExtractItems_JSON_WithoutItensIsNotAnError(t *testing.T) {
	t.Parallel()

	items, err := inbound.ExtractItems([]byte(`{"cnpj_emitente":"12345678000199"}`), "application/json")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("expected no items, got %d", len(items))
	}
}
