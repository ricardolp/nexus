export const FISCAL_NFSE_NUMBER_RANGE_EVENT_TYPES = [
  'inutilization_requested',
  'inutilization_authorized',
  'inutilization_rejected',
  'status_query',
  'manual_note',
] as const;

export type FiscalNfseNumberRangeEventType = (typeof FISCAL_NFSE_NUMBER_RANGE_EVENT_TYPES)[number];
