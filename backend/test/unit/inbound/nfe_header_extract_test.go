package inbound_test

import (
	"testing"

	"github.com/nexus/fiscal-messaging/internal/inbound"
)

const sampleHeaderNFeXML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe42260522479375000119550020000197301234567890">
      <ide>
        <serie>2</serie>
        <nNF>19730</nNF>
        <mod>55</mod>
        <natOp>VENDA DE MERCADORIA</natOp>
        <dhEmi>2026-05-22T10:15:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <finNFe>1</finNFe>
      </ide>
      <emit>
        <CNPJ>22479375000119</CNPJ>
        <xNome>FORNECEDOR EXEMPLO LTDA</xNome>
        <xFant>FORNECEDOR</xFant>
        <enderEmit>
          <xLgr>RUA DAS INDUSTRIAS</xLgr>
          <nro>100</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4205407</cMun>
          <xMun>FLORIANOPOLIS</xMun>
          <UF>SC</UF>
          <CEP>88010000</CEP>
          <fone>4833334444</fone>
        </enderEmit>
        <IE>255123456</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>13677964000200</CNPJ>
        <xNome>DESTINATARIO NEXUS LTDA</xNome>
        <enderDest>
          <xLgr>AV PRINCIPAL</xLgr>
          <nro>500</nro>
          <xBairro>SACO GRANDE</xBairro>
          <xMun>FLORIANOPOLIS</xMun>
          <UF>SC</UF>
          <CEP>88032000</CEP>
        </enderDest>
        <IE>255987654</IE>
      </dest>
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
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <CST>00</CST>
              <vBC>1800.00</vBC>
              <pICMS>12.00</pICMS>
              <vICMS>216.00</vICMS>
            </ICMS00>
          </ICMS>
          <IPI>
            <IPITrib>
              <CST>50</CST>
              <vBC>1800.00</vBC>
              <pIPI>5.00</pIPI>
              <vIPI>90.00</vIPI>
            </IPITrib>
          </IPI>
          <PIS>
            <PISAliq>
              <CST>01</CST>
              <vBC>1800.00</vBC>
              <pPIS>1.65</pPIS>
              <vPIS>29.70</vPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <CST>01</CST>
              <vBC>1800.00</vBC>
              <pCOFINS>7.60</pCOFINS>
              <vCOFINS>136.80</vCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vBC>1800.00</vBC>
          <vICMS>216.00</vICMS>
          <vST>0.00</vST>
          <vProd>1800.00</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>90.00</vIPI>
          <vPIS>29.70</vPIS>
          <vCOFINS>136.80</vCOFINS>
          <vNF>1890.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

func TestExtractNFeHeader_PartnersTotalsAndKey(t *testing.T) {
	t.Parallel()

	header, err := inbound.ExtractNFeHeader([]byte(sampleHeaderNFeXML), "application/xml")
	if err != nil {
		t.Fatal(err)
	}
	if header == nil {
		t.Fatal("expected header")
	}
	if header.AccessKey != "42260522479375000119550020000197301234567890" {
		t.Fatalf("access key: %q", header.AccessKey)
	}
	if header.Series != "2" || header.Number != "19730" || header.IssuerCNPJ != "22479375000119" {
		t.Fatalf("unexpected identity: %+v", header)
	}
	if header.Details.Issuer.LegalName != "FORNECEDOR EXEMPLO LTDA" || header.Details.Issuer.Address == nil || header.Details.Issuer.Address.UF != "SC" {
		t.Fatalf("issuer not extracted: %+v", header.Details.Issuer)
	}
	if header.Details.Recipient.LegalName != "DESTINATARIO NEXUS LTDA" {
		t.Fatalf("recipient not extracted: %+v", header.Details.Recipient)
	}
	if header.Details.NatureOfOperation != "VENDA DE MERCADORIA" {
		t.Fatalf("natOp: %q", header.Details.NatureOfOperation)
	}
	if header.IssuedAt == nil {
		t.Fatal("expected issued_at")
	}
	if header.Details.Totals == nil || header.Details.Totals.NF != 1890 || header.Details.Totals.ICMS != 216 {
		t.Fatalf("totals: %+v", header.Details.Totals)
	}
}

func TestExtractItems_Taxes(t *testing.T) {
	t.Parallel()

	items, err := inbound.ExtractItems([]byte(sampleHeaderNFeXML), "application/xml")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(items))
	}
	icms := items[0].Taxes.ICMS
	if icms == nil || icms.CST != "00" || icms.Amount != 216 || icms.Rate != 12 {
		t.Fatalf("ICMS: %+v", icms)
	}
	if items[0].Taxes.IPI == nil || items[0].Taxes.IPI.Amount != 90 {
		t.Fatalf("IPI: %+v", items[0].Taxes.IPI)
	}
	if items[0].Taxes.PIS == nil || items[0].Taxes.COFINS == nil {
		t.Fatalf("PIS/COFINS missing: %+v", items[0].Taxes)
	}
}

func TestNFeExtensionFromHeader_IncludesMetadata(t *testing.T) {
	t.Parallel()

	header, err := inbound.ExtractNFeHeader([]byte(sampleHeaderNFeXML), "application/xml")
	if err != nil {
		t.Fatal(err)
	}
	ext := inbound.NFeExtensionFromHeader(header)
	if ext == nil || len(ext.MetadataJSON) == 0 {
		t.Fatal("expected metadata_json on the fiscal extension")
	}
	if ext.IssuedAt == nil {
		t.Fatal("expected issued_at on the fiscal extension")
	}
}
