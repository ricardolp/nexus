export type SapPedidoLineInput = {
  xPed: string;
  nItemPed: string;
  qty: number;
  materialCode?: string;
};

export type SapPedidoLineResult = {
  xPed: string;
  nItemPed: string;
  matched: boolean;
  sapOrderNumber?: string;
  sapOrderItem?: string;
  message?: string;
};

export type PedidoValidationResult = {
  allMatched: boolean;
  lines: SapPedidoLineResult[];
};

export type SapDocLineRef = {
  docNumber: string;
  itemNumber?: string;
  fiscalYear?: string;
  nfeItemLine?: number;
};

export type DeliveryResult = {
  deliveryNumber: string;
  fiscalYear?: string;
  lines: SapDocLineRef[];
  rawResponse?: Record<string, unknown>;
};

/** Resposta do DELIVERY_POST na portaria: inclui documento de material (MIGO). */
export type DeliveryPortariaResult = DeliveryResult & {
  migoNumber: string;
  migoFiscalYear: string;
};

export type MigoResult = {
  migoNumber: string;
  fiscalYear?: string;
  lines: SapDocLineRef[];
  accountingDocNumber?: string;
};

export type MiroResult = {
  miroNumber: string;
  fiscalYear?: string;
  lines: SapDocLineRef[];
  accountingDocNumber?: string;
  rawResponse?: Record<string, unknown>;
};

export type SapInboundDeliveryInput = {
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
};

export type SapInboundMiroOrderRef = {
  sapOrderNumber: string;
  sapOrderItem: string;
  qty: number;
  itemAmount: number;
  nfItem: number;
  poUnit: string;
  taxCode?: string;
};

export type SapInboundMiroInput = {
  numero: string;
  serie: string;
  datadoc: Date;
  datalanc: Date;
  docType?: string;
  valorTotal: number;
  protocoloConsulta?: string;
  companyCode?: string;
  currency?: string;
  headerText?: string;
  paymentTerms?: string;
  partnerBank?: string;
  calcTax?: boolean;
  invoiceInd?: boolean;
  simulate?: boolean;
  nfeAccessKey: string;
  migoNumber?: string;
  fiscalYear?: string;
  orderRefs: SapInboundMiroOrderRef[];
};

export interface SapInboundAdapter {
  validatePurchaseOrderLines(input: {
    cnpj: string;
    branchCnpj: string;
    issuedAt: Date;
    lines: SapPedidoLineInput[];
  }): Promise<PedidoValidationResult>;

  createInboundDelivery(input: SapInboundDeliveryInput): Promise<DeliveryResult>;
  postInboundDeliveryPortaria(input: SapInboundDeliveryInput): Promise<DeliveryPortariaResult>;

  postGoodsMovementMigo(input: {
    deliveryNumber: string;
    fiscalYear?: string;
  }): Promise<MigoResult>;

  postInvoiceVerificationMiro(input: SapInboundMiroInput): Promise<MiroResult>;
}
