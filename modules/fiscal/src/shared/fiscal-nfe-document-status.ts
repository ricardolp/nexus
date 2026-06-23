export const FISCAL_NFE_DOCUMENT_STATUSES = [
  'draft',
  'received',
  'validating',
  'validation_error',
  'waiting_processing',
  'sent_to_sefaz',
  'authorized',
  'rejected',
  'denied',
  'cancel_requested',
  'cancelled',
  'cancel_rejected',
  'inutilized',
  'processing_error',
  'contingency',
  'closed',
] as const;

export type FiscalNfeDocumentStatus = (typeof FISCAL_NFE_DOCUMENT_STATUSES)[number];
