export const FISCAL_NFE_TIMELINE_SOURCES = [
  'system',
  'user',
  'sefaz',
  'sap',
  'webhook',
  'job',
  'api',
] as const;

export type FiscalNfeTimelineSource = (typeof FISCAL_NFE_TIMELINE_SOURCES)[number];
