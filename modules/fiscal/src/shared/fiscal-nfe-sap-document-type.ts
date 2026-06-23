export const FISCAL_NFE_SAP_DOCUMENT_TYPES = [
  'purchase_order',
  'inbound_delivery',
  'goods_movement',
  'invoice_verification',
  'accounting_doc',
] as const;

export type FiscalNfeSapDocumentType = (typeof FISCAL_NFE_SAP_DOCUMENT_TYPES)[number];
