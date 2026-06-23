export const FISCAL_NFE_NUMBER_RANGE_EVENT_TYPES = [
  'inutilization_requested',
  'inutilization_authorized',
  'inutilization_rejected',
  'status_query',
  'manual_note',
] as const;

export type FiscalNfeNumberRangeEventType = (typeof FISCAL_NFE_NUMBER_RANGE_EVENT_TYPES)[number];
