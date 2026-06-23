export const SAP_INBOUND_DELIVERY_DOCUMENT = "delivery";
export const SAP_INBOUND_DELIVERY_POST_DOCUMENT = "delivery_post";
export const SAP_INBOUND_DELIVERY_TIPO = "MERCADORIA";

export type SapInboundDeliveryPedidoLine = {
  pedido: string;
  item: string;
  quantidade: number;
  component?: string;
};

export type SapInboundDeliveryRequest = {
  document:
    | typeof SAP_INBOUND_DELIVERY_DOCUMENT
    | typeof SAP_INBOUND_DELIVERY_POST_DOCUMENT;
  numero: string;
  serie: string;
  datadoc: string;
  tipo_documento: string;
  pedidoscompra: SapInboundDeliveryPedidoLine[];
  delivery?: string;
};

export type SapInboundDeliveryResponse = {
  /** CPI/Nexus formato atual */
  deliverynumber?: string;
  deliveryNumber?: string;
  DELIVERYNUMBER?: string;
  deliverynumbers?: string[];
  deliveryNumbers?: string[];
  DELIVERYNUMBERS?: string[];
  erros?: unknown[];
  ERROS?: unknown[];
  return?: unknown[];
  RETURN?: unknown[];
  numero?: string;
  NUMERO?: string;
  serie?: string;
  SERIE?: string;
  ano?: string;
  ANO?: string;
  GJAHR?: string;
  fiscalYear?: string;
  pedidoscompra?: SapInboundDeliveryPedidoLine[];
  PEDIDOSCOMPRA?: unknown[];
  MESSAGE?: unknown[];
  message?: unknown[];
  materialdocument?: string;
  MATERIALDOCUMENT?: string;
  matdocumentyear?: number | string;
  MATDOCUMENTYEAR?: number | string;
  [key: string]: unknown;
};

export type CreateInboundDeliveryInput = {
  numero: string;
  serie: string;
  datadoc: string;
  tipoDocumento?: string;
  document?:
    | typeof SAP_INBOUND_DELIVERY_DOCUMENT
    | typeof SAP_INBOUND_DELIVERY_POST_DOCUMENT;
  delivery?: string;
  nfeAccessKey?: string;
  orderRefs: {
    sapOrderNumber: string;
    sapOrderItem: string;
    qty: number;
    materialCode?: string;
  }[];
};
