export const FISCAL_NFSE_SAP_DOCUMENT_STATUSES = [
  'pending',
  'success',
  'error',
] as const;

export type FiscalNfseSapDocumentStatus = (typeof FISCAL_NFSE_SAP_DOCUMENT_STATUSES)[number];
