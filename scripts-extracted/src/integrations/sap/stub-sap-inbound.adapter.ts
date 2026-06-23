import type {
  DeliveryPortariaResult,
  DeliveryResult,
  MigoResult,
  MiroResult,
  PedidoValidationResult,
  SapInboundAdapter,
  SapInboundMiroInput,
  SapPedidoLineInput,
} from "./sap-inbound.types.js";

function stubDocNumber(prefix: string, seed: string): string {
  const n = seed.replace(/\D/g, "").slice(-8).padStart(8, "0");
  return `${prefix}${n}`;
}

export class StubSapInboundAdapter implements SapInboundAdapter {
  async validatePurchaseOrderLines(input: {
    cnpj: string;
    branchCnpj: string;
    issuedAt: Date;
    lines: SapPedidoLineInput[];
  }): Promise<PedidoValidationResult> {
    const lines = input.lines.map((line) => {
      const hasPedido = Boolean(line.xPed?.trim() && line.nItemPed?.trim());
      return {
        xPed: line.xPed,
        nItemPed: line.nItemPed,
        matched: hasPedido,
        sapOrderNumber: hasPedido ? line.xPed.trim() : undefined,
        sapOrderItem: hasPedido ? line.nItemPed.trim() : undefined,
        message: hasPedido ? undefined : "Pedido de compra não informado no XML",
      };
    });

    return {
      allMatched: lines.length > 0 && lines.every((l) => l.matched),
      lines,
    };
  }

  async createInboundDelivery(input: {
    numero: string;
    serie: string;
    datadoc: string;
    tipoDocumento?: string;
    nfeAccessKey?: string;
    orderRefs: {
      sapOrderNumber: string;
      sapOrderItem: string;
      qty: number;
      materialCode?: string;
    }[];
  }): Promise<DeliveryResult> {
    const deliveryNumber = input.nfeAccessKey
      ? stubDocNumber("18", input.nfeAccessKey)
      : stubDocNumber("18", `${input.numero}${input.serie}`);
    const fiscalYear = String(new Date().getFullYear());
    return {
      deliveryNumber,
      fiscalYear,
      lines: input.orderRefs.map((_ref, i) => ({
        docNumber: deliveryNumber,
        itemNumber: String((i + 1) * 10).padStart(5, "0"),
        fiscalYear,
        nfeItemLine: i + 1,
      })),
    };
  }

  async postInboundDeliveryPortaria(input: {
    numero: string;
    serie: string;
    datadoc: string;
    tipoDocumento?: string;
    document?: "delivery" | "delivery_post";
    delivery?: string;
    nfeAccessKey?: string;
    orderRefs: {
      sapOrderNumber: string;
      sapOrderItem: string;
      qty: number;
      materialCode?: string;
    }[];
  }): Promise<DeliveryPortariaResult> {
    const deliveryNumber = input.delivery?.trim();
    if (!deliveryNumber) {
      throw new Error("Delivery number is required for DELIVERY_POST");
    }
    const migoNumber = stubDocNumber("50", deliveryNumber);
    const migoFiscalYear = String(new Date().getFullYear());
    return {
      deliveryNumber,
      fiscalYear: migoFiscalYear,
      migoNumber,
      migoFiscalYear,
      lines: input.orderRefs.map((_ref, i) => ({
        docNumber: migoNumber,
        itemNumber: String((i + 1) * 10).padStart(5, "0"),
        fiscalYear: migoFiscalYear,
        nfeItemLine: i + 1,
      })),
      rawResponse: {
        document: "delivery_post",
        deliverynumber: deliveryNumber,
        deliverynumbers: [deliveryNumber],
        erros: [],
        return: [],
        message: [],
        materialdocument: migoNumber,
        matdocumentyear: Number(migoFiscalYear),
      },
    };
  }

  async postGoodsMovementMigo(input: {
    deliveryNumber: string;
    fiscalYear?: string;
  }): Promise<MigoResult> {
    const migoNumber = stubDocNumber("50", input.deliveryNumber);
    const fiscalYear = input.fiscalYear ?? String(new Date().getFullYear());
    return {
      migoNumber,
      fiscalYear,
      accountingDocNumber: stubDocNumber("51", migoNumber),
      lines: [{ docNumber: migoNumber, itemNumber: "0001", fiscalYear }],
    };
  }

  async postInvoiceVerificationMiro(input: SapInboundMiroInput): Promise<MiroResult> {
    const miroNumber = stubDocNumber("51", input.nfeAccessKey);
    const fiscalYear = input.fiscalYear ?? String(new Date().getFullYear());
    return {
      miroNumber,
      fiscalYear,
      accountingDocNumber: miroNumber,
      lines: [{ docNumber: miroNumber, itemNumber: "0001", fiscalYear }],
      rawResponse: {
        document: "MIRO",
        protocoloConsulta: input.protocoloConsulta,
        invoicedocument: miroNumber,
        fiscalyear: Number(fiscalYear),
      },
    };
  }
}

