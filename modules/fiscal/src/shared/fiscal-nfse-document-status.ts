export const FISCAL_NFSE_DOCUMENT_STATUSES = [
  'draft',
  'received',
  'validating',
  'validation_error',
  'waiting_processing',
  'sent_to_prefeitura',
  'authorized',
  'rejected',
  'denied',
  'cancel_requested',
  'cancelled',
  'cancel_rejected',
  'substituted',
  'processing_error',
  'closed',
] as const;

export type FiscalNfseDocumentStatus = (typeof FISCAL_NFSE_DOCUMENT_STATUSES)[number];
