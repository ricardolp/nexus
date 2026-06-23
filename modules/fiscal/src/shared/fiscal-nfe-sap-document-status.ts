export const FISCAL_NFE_SAP_DOCUMENT_STATUSES = [
  'pending',
  'success',
  'error',
] as const;

export type FiscalNfeSapDocumentStatus = (typeof FISCAL_NFE_SAP_DOCUMENT_STATUSES)[number];
