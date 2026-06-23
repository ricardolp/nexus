import assert from "node:assert/strict";
import {
  buildInboundDeliveryPayload,
  buildInboundDeliveryUrl,
  formatSapDocDate,
  mapDeliveryResponse,
  mapPortariaResponse,
  parseDeliveryResponse,
  parsePortariaResponse,
  readDeliveryNumber,
} from "./sap-delivery.client.js";
import {
  buildPurchaseOrdersQueryParams,
  formatCutoffDate,
  loadMockPurchaseOrders,
  shouldUseMockPurchaseOrders,
} from "./sap-purchase-orders.client.js";
import { matchPedidoLines, normalizeSapItemNumber } from "./sap-purchase-orders.match.js";
import { flattenPedidosToCompraLines, parsePurchaseOrdersResponse } from "./sap-purchase-orders.parse.js";
import {
  buildInboundMiroPayload,
  mapMiroResponse,
  parseMiroResponse,
} from "./sap-miro.client.js";
import type { SapPedidoCompraLine } from "./sap-purchase-orders.types.js";

function testFormatCutoffDate() {
  const issued = new Date("2025-04-01T12:00:00.000Z");
  const cutoff = formatCutoffDate(issued);
  assert.equal(cutoff, "01-01-2025");
}

function testNormalizeItem() {
  assert.equal(normalizeSapItemNumber("00010"), "10");
  assert.equal(normalizeSapItemNumber(10), "10");
}

function testMatchPedidoWrongOrderNumber() {
  const sapLines: SapPedidoCompraLine[] = [
    { PEDIDO: "4504342366", ITEM: 10, COD_SERV: "40362360", DESCR_SERV: "A" },
    { PEDIDO: "4504342366", ITEM: 20, COD_SERV: "40362361", DESCR_SERV: "B" },
    { PEDIDO: "4504342368", ITEM: 30, COD_SERV: "40007370", DESCR_SERV: "C" },
  ];
  const wrongPedido = matchPedidoLines(
    [{ xPed: "4504342366", nItemPed: "30", qty: 12 }],
    sapLines
  );
  assert.equal(wrongPedido[0]?.matched, false);
  const correctPedido = matchPedidoLines(
    [{ xPed: "4504342368", nItemPed: "30", qty: 12 }],
    sapLines
  );
  assert.equal(correctPedido[0]?.matched, true);
}

function testMatchPedidoLines() {
  const sapLines: SapPedidoCompraLine[] = [
    {
      PEDIDO: "4504332174",
      ITEM: 10,
      COD_SERV: "40349739",
      DESCR_SERV: "FILTRO",
    },
    {
      PEDIDO: "4504332174",
      ITEM: 50,
      COD_SERV: "40338727",
      DESCR_SERV: "FILTRO2",
    },
  ];

  const results = matchPedidoLines(
    [
      { xPed: "4504332174", nItemPed: "10", qty: 1 },
      { xPed: "4504332174", nItemPed: "00050", qty: 2 },
      { xPed: "999", nItemPed: "10", qty: 1 },
    ],
    sapLines
  );

  assert.equal(results[0]?.matched, true);
  assert.equal(results[0]?.sapOrderNumber, "4504332174");
  assert.equal(results[0]?.sapOrderItem, "10");
  assert.equal(results[1]?.matched, true);
  assert.equal(results[2]?.matched, false);
}

function testBuildQueryParams() {
  const qs = buildPurchaseOrdersQueryParams(
    {
      issuerCnpj: "60700135000787",
      branchCnpj: "13677694000200",
      issuedAt: new Date("2025-04-01T12:00:00.000Z"),
      sapClient: "310",
      sapLanguage: "PT",
    },
    { includeCpiMockPo: true }
  );
  assert.equal(qs.get("sap-client"), "310");
  assert.equal(qs.get("document"), "60700135000787");
  assert.equal(qs.get("branchCnpj"), "13677694000200");
  assert.equal(qs.get("type"), "MERCADORIA");
  assert.equal(qs.get("name"), "PurchaseOrders");
  assert.equal(qs.get("mock_po"), "true");
}

function testShouldUseMock() {
  assert.equal(shouldUseMockPurchaseOrders({ SAP_MOCK_PO: "true" } as never), true);
  assert.equal(shouldUseMockPurchaseOrders({ SAP_MOCK_PO: "false" } as never), false);
}

function testParseNestedPedidosPayload() {
  const parsed = parsePurchaseOrdersResponse({
    pedidos: [
      {
        cabecalho: {
          pedido: "4504332174",
          empresa: "BR10",
          dataCriacao: "2025-06-20",
          fornecedor: "0000402408",
        },
        itens: [
          {
            item: 10,
            material: "40349739",
            descricao: "FILTRO-DE SEGURANÇA-TRG190",
            centro: "BR1A",
            deposito: "4000",
            unidade: "EA",
            quantidade: 20,
            valorBruto: 962.97,
            valorLiquido: 962.97,
            valorUnitario: 48.1485,
            fluxoRecebimentoNec: "MERCADORIA",
            impostos: [{ tipo: "ICMS", condicaoAliquota: "BIC0", condicaoValor: "BX12" }],
          },
        ],
      },
    ],
  });

  assert.equal(parsed.PEDIDOSCOMPRA.length, 1);
  const line = parsed.PEDIDOSCOMPRA[0];
  assert.equal(line?.PEDIDO, "4504332174");
  assert.equal(line?.ITEM, 10);
  assert.equal(line?.COD_SERV, "40349739");
  assert.equal(line?.DESCR_SERV, "FILTRO-DE SEGURANÇA-TRG190");
  assert.equal(line?.QTD_DISPONIVEL, 20);
  assert.equal(line?.FLUXO_RECEBIMENTO_NEC, "MERCADORIA");
  assert.equal(line?.EMPRESA, "BR10");
  assert.equal(line?.FORNECEDOR, "0000402408");
  assert.equal(line?.IMPOSTOS?.[0]?.tipo, "ICMS");

  const match = matchPedidoLines(
    [{ xPed: "4504332174", nItemPed: "10", qty: 1 }],
    parsed.PEDIDOSCOMPRA
  );
  assert.equal(match[0]?.matched, true);
}

function testParseLegacyPedidosCompraPayload() {
  const parsed = parsePurchaseOrdersResponse({
    PEDIDOSCOMPRA: [
      { PEDIDO: "4504332174", ITEM: 10, COD_SERV: "40349739", DESCR_SERV: "FILTRO" },
    ],
  });
  assert.equal(parsed.PEDIDOSCOMPRA.length, 1);
  assert.equal(parsed.PEDIDOSCOMPRA[0]?.PEDIDO, "4504332174");
}

async function testLoadMockPurchaseOrders() {
  const mock = await loadMockPurchaseOrders();
  assert.ok(mock.PEDIDOSCOMPRA.length >= 4);
  const lookup = flattenPedidosToCompraLines([]);
  assert.equal(lookup.length, 0);
  const line = mock.PEDIDOSCOMPRA.find((row) => row.PEDIDO === "4504342368" && row.ITEM === 30);
  assert.equal(line?.COD_SERV, "40007370");
}

function testDeliveryPayload() {
  const payload = buildInboundDeliveryPayload({
    numero: "152756",
    serie: "1",
    datadoc: "20250625",
    orderRefs: [
      { sapOrderNumber: "4504342330", sapOrderItem: "10", qty: 250 },
      { sapOrderNumber: "4504335958", sapOrderItem: "50", qty: 200 },
    ],
  });
  assert.equal(payload.document, "delivery");
  assert.equal(payload.numero, "152756");
  assert.equal(payload.serie, "1");
  assert.equal(payload.datadoc, "20250625");
  assert.equal(payload.tipo_documento, "MERCADORIA");
  assert.equal(payload.pedidoscompra[0]?.pedido, "4504342330");
  assert.equal(payload.pedidoscompra[0]?.item, "00010");
  assert.equal(payload.pedidoscompra[0]?.quantidade, 250);
  assert.equal(payload.pedidoscompra[0]?.component, undefined);
  assert.equal(payload.pedidoscompra[1]?.item, "00050");
}

function testPortariaResponseMapsMigo() {
  const body = {
    deliverynumber: "",
    deliverynumbers: [],
    erros: [],
    return: [],
    message: [],
    materialdocument: "5000123456",
    matdocumentyear: 2025,
  };
  const parsed = parsePortariaResponse(body);
  assert.equal(parsed.materialdocument, "5000123456");
  const result = mapPortariaResponse(parsed, {
    numero: "152756",
    serie: "1",
    datadoc: "20250625",
    delivery: "0180015583",
    orderRefs: [{ sapOrderNumber: "4504342330", sapOrderItem: "10", qty: 250 }],
  });
  assert.equal(result.migoNumber, "5000123456");
  assert.equal(result.migoFiscalYear, "2025");
  assert.equal(result.deliveryNumber, "0180015583");
}

function testParsePortariaRejectsMissingMaterialDocument() {
  assert.throws(() =>
    parsePortariaResponse({
      deliverynumber: "",
      deliverynumbers: [],
      erros: [],
      return: [],
      message: [],
      materialdocument: "",
      matdocumentyear: 0,
    })
  );
}

function testDeliveryPostPayload() {
  const payload = buildInboundDeliveryPayload({
    numero: "152756",
    serie: "1",
    datadoc: "20250625",
    document: "delivery_post",
    delivery: "0180015583",
    orderRefs: [
      {
        sapOrderNumber: "4504342330",
        sapOrderItem: "10",
        qty: 250,
        materialCode: "000000000000000000123",
      },
    ],
  });
  assert.equal(payload.document, "delivery_post");
  assert.equal(payload.delivery, "0180015583");
  assert.equal(payload.pedidoscompra[0]?.item, "00010");
  assert.equal(payload.pedidoscompra[0]?.component, "000000000000000000123");
}

function testMiroPayload() {
  const payload = buildInboundMiroPayload({
    numero: "19730",
    serie: "1",
    datadoc: new Date("2026-05-28T00:00:00.000Z"),
    datalanc: new Date("2026-05-28T00:00:00.000Z"),
    valorTotal: 1500,
    protocoloConsulta: "MIRO-4504324916-001",
    nfeAccessKey: "42260522479375000119550010000197301906383658",
    orderRefs: [
      {
        sapOrderNumber: "4504324916",
        sapOrderItem: "10",
        qty: 10,
        itemAmount: 1000,
        nfItem: 1,
        poUnit: "PC",
      },
      {
        sapOrderNumber: "4504324916",
        sapOrderItem: "20",
        qty: 5,
        itemAmount: 500,
        nfItem: 2,
        poUnit: "PC",
      },
    ],
  });
  assert.equal(payload.document, "MIRO");
  assert.equal(payload.protocoloConsulta, "MIRO-4504324916-001");
  assert.equal(payload.header.doc_date, "20260528");
  assert.equal(payload.header.posting_date, "20260528");
  assert.equal(payload.header.reference, "19730-1");
  assert.equal(payload.header.doc_type, "RE");
  assert.equal(payload.header.gross_amount, 1500);
  assert.equal(payload.header.currency, "BRL");
  assert.equal(payload.header.calc_tax, true);
  assert.equal(payload.header.invoice_ind, true);
  assert.equal(payload.header.simulate, false);
  assert.equal(payload.items[0]?.po_number, "4504324916");
  assert.equal(payload.items[0]?.po_item, "00010");
  assert.equal(payload.items[0]?.nf_item, "1");
  assert.equal(payload.items[0]?.quantity, 10);
  assert.equal(payload.items[0]?.item_amount, 1000);
  assert.equal(payload.items[0]?.po_unit, "PC");
}

function testParseMiroResponseInvoiceDocNumber() {
  const body = {
    invoiceDocNumber: "5105634831",
    fiscalYear: 2026,
    return: [],
  };
  const parsed = parseMiroResponse(body);
  assert.equal(parsed.invoiceDocNumber, "5105634831");
  const mapped = mapMiroResponse(body, {
    numero: "19730",
    serie: "1",
    datadoc: new Date("2026-05-19"),
    datalanc: new Date("2026-06-09"),
    valorTotal: 577.02,
    nfeAccessKey: "42260522479375000119550010000197301906383658",
    orderRefs: [
      {
        sapOrderNumber: "4504342366",
        sapOrderItem: "30",
        qty: 12,
        itemAmount: 541.8,
        nfItem: 1,
        poUnit: "PC",
      },
    ],
  });
  assert.equal(mapped.miroNumber, "5105634831");
  assert.equal(mapped.fiscalYear, "2026");
}

function testFormatSapDocDate() {
  assert.equal(formatSapDocDate(new Date("2025-06-25T16:42:30.000Z")), "20250625");
}

function testBuildDeliveryUrl() {
  const url = buildInboundDeliveryUrl("https://cpi.example/sap/inbound", "310");
  assert.ok(url.includes("sap-client=310"));
}

function testMapDeliveryResponse() {
  const result = mapDeliveryResponse(
    { DELIVERYNUMBER: "1800123456", ANO: "2025" },
    {
      numero: "152756",
      serie: "1",
      datadoc: "20250625",
      orderRefs: [{ sapOrderNumber: "4504342330", sapOrderItem: "10", qty: 250 }],
    }
  );
  assert.equal(result.deliveryNumber, "1800123456");
  assert.equal(result.fiscalYear, "2025");
  assert.equal(result.lines[0]?.itemNumber, "00010");
}

function testParseRejectsNumeroEchoAsDelivery() {
  assert.throws(() =>
    parseDeliveryResponse({
      deliverynumber: "",
      deliverynumbers: [],
      erros: [],
      message: [],
      numero: "70398",
    })
  );
}

function testParseRejectsMessageTypeE() {
  assert.throws(() =>
    parseDeliveryResponse({
      deliverynumber: "",
      deliverynumbers: [],
      erros: [],
      message: [{ type: "E", message: "Pedido inválido" }],
    })
  );
}

function testCpiDeliveryResponseFormat() {
  const body = {
    deliverynumber: "0180015583",
    deliverynumbers: ["0180015583"],
    erros: [],
    return: [],
    message: [],
  };
  assert.equal(readDeliveryNumber(body, "fallback"), "0180015583");
  const parsed = parseDeliveryResponse(body);
  assert.equal(parsed.deliverynumber, "0180015583");
  const result = mapDeliveryResponse(parsed, {
    numero: "152756",
    serie: "1",
    datadoc: "20250625",
    orderRefs: [{ sapOrderNumber: "4504342330", sapOrderItem: "10", qty: 250 }],
  });
  assert.equal(result.deliveryNumber, "0180015583");
  assert.deepEqual(result.rawResponse?.deliverynumbers, ["0180015583"]);
}

function testDeliveryResponseWithErros() {
  assert.throws(() =>
    parseDeliveryResponse({
      deliverynumber: "",
      erros: [{ message: "Pedido inválido" }],
      message: [],
    })
  );
}

testFormatCutoffDate();
testNormalizeItem();
testMatchPedidoWrongOrderNumber();
testMatchPedidoLines();
testBuildQueryParams();
testShouldUseMock();
testParseNestedPedidosPayload();
testParseLegacyPedidosCompraPayload();
await testLoadMockPurchaseOrders();
testDeliveryPayload();
testDeliveryPostPayload();
testMiroPayload();
testParseMiroResponseInvoiceDocNumber();
testPortariaResponseMapsMigo();
testParsePortariaRejectsMissingMaterialDocument();
testFormatSapDocDate();
testBuildDeliveryUrl();
testMapDeliveryResponse();
testParseRejectsNumeroEchoAsDelivery();
testParseRejectsMessageTypeE();
testCpiDeliveryResponseFormat();
testDeliveryResponseWithErros();
console.log("sap-purchase-orders.test.ts: ok");
