export const FISCAL_NFSE_SAP_DOCUMENT_TYPES = [
  'purchase_order',
  'inbound_delivery',
  'goods_movement',
  'invoice_verification',
  'accounting_doc',
] as const;

export type FiscalNfseSapDocumentType = (typeof FISCAL_NFSE_SAP_DOCUMENT_TYPES)[number];
