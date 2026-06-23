import type {
  SapPedidoCompraLine,
  SapPurchaseOrder,
  SapPurchaseOrdersRawResponse,
  SapPurchaseOrdersResponse,
} from "./sap-purchase-orders.types.js";

export function flattenPedidosToCompraLines(pedidos: SapPurchaseOrder[]): SapPedidoCompraLine[] {
  const lines: SapPedidoCompraLine[] = [];

  for (const pedido of pedidos) {
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
  body: SapPurchaseOrdersRawResponse
): SapPurchaseOrdersResponse {
  const nestedPedidos = Array.isArray(body.pedidos) ? body.pedidos : [];
  const legacyPedidos = Array.isArray(body.PEDIDOSCOMPRA) ? body.PEDIDOSCOMPRA : [];
  const pedidos =
    nestedPedidos.length > 0 ? flattenPedidosToCompraLines(nestedPedidos) : legacyPedidos;
  const messages = Array.isArray(body.MESSAGE) ? body.MESSAGE : [];

  if (messages.length > 0 && pedidos.length === 0) {
    throw new Error("SAP returned MESSAGE without purchase orders");
  }

  return {
    PEDIDOSCOMPRA: pedidos,
    PROGRAMASREMESSA: body.PROGRAMASREMESSA ?? [],
    ESTOQUE_NO_FORNECEDOR: body.ESTOQUE_NO_FORNECEDOR ?? [],
    MESSAGE: messages,
  };
}
