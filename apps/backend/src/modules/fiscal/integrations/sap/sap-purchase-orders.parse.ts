import type {
  SapFlatPurchaseOrder,
  SapPedidoCompraLine,
  SapPurchaseOrder,
  SapPurchaseOrderInput,
  SapPurchaseOrdersRawResponse,
  SapPurchaseOrdersResponse,
} from "./sap-purchase-orders.types.js";

export function normalizePurchaseOrder(
  raw: SapPurchaseOrderInput,
): SapPurchaseOrder {
  if ("cabecalho" in raw && raw.cabecalho) {
    return raw;
  }

  const { itens, ...header } = raw as SapFlatPurchaseOrder;
  return {
    cabecalho: header,
    itens: itens ?? [],
  };
}

export function flattenPedidosToCompraLines(
  pedidos: SapPurchaseOrderInput[],
): SapPedidoCompraLine[] {
  const lines: SapPedidoCompraLine[] = [];

  for (const raw of pedidos) {
    const pedido = normalizePurchaseOrder(raw);
    const header = pedido.cabecalho;
    const pedidoNum = header?.pedido?.trim() ?? "";
    if (!pedidoNum) continue;

    for (const item of pedido.itens ?? []) {
      lines.push({
        PEDIDO: pedidoNum,
        ITEM: item.item,
        COD_SERV: item.material ?? "",
        DESCR_SERV: item.descricao ?? "",
        DATA_CRIACAO: header.dataCriacao,
        UNIDADE: item.unidade,
        VALOR_BRUTO: item.valorBruto,
        VAL_UNIT: item.valorUnitario,
        QTD_DISPONIVEL: item.quantidade,
        VAL_DISPONIVEL: item.valorLiquido,
        FLUXO_RECEBIMENTO_NEC: item.fluxoRecebimentoNec,
        CENTRO: item.centro,
        DEPOSITO: item.deposito,
        EMPRESA: header.empresa,
        TIPO_PEDIDO: header.tipoPedido,
        ORGANIZACAO_COMPRAS: header.organizacaoCompras,
        GRUPO_COMPRAS: header.grupoCompras,
        FORNECEDOR: header.fornecedor,
        NOME_FORNECEDOR: header.nomeFornecedor,
        MOEDA: header.moeda,
        CONDICAO_PAGAMENTO: header.condicaoPagamento,
        CRIADO_POR: header.criadoPor,
        IMPOSTOS: item.impostos,
      });
    }
  }

  return lines;
}

export function parsePurchaseOrdersResponse(
  body: SapPurchaseOrdersRawResponse,
): SapPurchaseOrdersResponse {
  let nestedPedidos: SapPurchaseOrderInput[] = [];
  let legacyPedidos: SapPedidoCompraLine[] = [];
  let messages: unknown[] = [];
  let programasRemessa: unknown[] = [];
  let estoqueNoFornecedor: unknown[] = [];

  if (Array.isArray(body)) {
    nestedPedidos = body;
  } else {
    nestedPedidos = Array.isArray(body.pedidos) ? body.pedidos : [];
    legacyPedidos = Array.isArray(body.PEDIDOSCOMPRA) ? body.PEDIDOSCOMPRA : [];
    messages = Array.isArray(body.MESSAGE) ? body.MESSAGE : [];
    programasRemessa = body.PROGRAMASREMESSA ?? [];
    estoqueNoFornecedor = body.ESTOQUE_NO_FORNECEDOR ?? [];
  }

  const pedidos =
    nestedPedidos.length > 0
      ? flattenPedidosToCompraLines(nestedPedidos)
      : legacyPedidos;

  if (messages.length > 0 && pedidos.length === 0) {
    throw new Error("SAP returned MESSAGE without purchase orders");
  }

  return {
    PEDIDOSCOMPRA: pedidos,
    PROGRAMASREMESSA: programasRemessa,
    ESTOQUE_NO_FORNECEDOR: estoqueNoFornecedor,
    MESSAGE: messages,
  };
}
