import type { SapPedidoCompraLine } from "./sap-purchase-orders.types.js";
import type { SapPedidoLineInput, SapPedidoLineResult } from "./sap-inbound.types.js";

export function normalizeSapItemNumber(value: string | number): string {
  const s = String(value).trim();
  if (!s) return "";
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s : String(n);
}

export function pedidoLineKey(pedido: string, item: string | number): string {
  return `${pedido.trim()}|${normalizeSapItemNumber(item)}`;
}

export function buildPedidoLookup(pedidos: SapPedidoCompraLine[]): Map<string, SapPedidoCompraLine> {
  const map = new Map<string, SapPedidoCompraLine>();
  for (const row of pedidos) {
    map.set(pedidoLineKey(row.PEDIDO, row.ITEM), row);
  }
  return map;
}

export function matchPedidoLines(
  lines: SapPedidoLineInput[],
  pedidosCompra: SapPedidoCompraLine[]
): SapPedidoLineResult[] {
  const lookup = buildPedidoLookup(pedidosCompra);

  return lines.map((line) => {
    const xPed = line.xPed?.trim() ?? "";
    const nItemPed = line.nItemPed?.trim() ?? "";
    if (!xPed || !nItemPed) {
      return {
        xPed: line.xPed,
        nItemPed: line.nItemPed,
        matched: false,
        message: "Pedido de compra não informado no XML",
      };
    }

    const sapRow = lookup.get(pedidoLineKey(xPed, nItemPed));
    if (!sapRow) {
      return {
        xPed: line.xPed,
        nItemPed: line.nItemPed,
        matched: false,
        message: "Pedido/item não encontrado no SAP",
      };
    }

    return {
      xPed: line.xPed,
      nItemPed: line.nItemPed,
      matched: true,
      sapOrderNumber: sapRow.PEDIDO,
      sapOrderItem: String(sapRow.ITEM),
    };
  });
}
