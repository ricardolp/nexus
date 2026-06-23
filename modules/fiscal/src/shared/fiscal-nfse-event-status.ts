export const FISCAL_NFSE_EVENT_STATUSES = [
  'pending',
  'sent',
  'accepted',
  'rejected',
  'error',
  'ignored',
] as const;

export type FiscalNfseEventStatus = (typeof FISCAL_NFSE_EVENT_STATUSES)[number];
