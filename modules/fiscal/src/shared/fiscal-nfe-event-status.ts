export const FISCAL_NFE_EVENT_STATUSES = [
  'pending',
  'sent',
  'accepted',
  'rejected',
  'error',
  'ignored',
] as const;

export type FiscalNfeEventStatus = (typeof FISCAL_NFE_EVENT_STATUSES)[number];
