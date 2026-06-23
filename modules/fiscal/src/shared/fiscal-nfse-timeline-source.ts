export const FISCAL_NFSE_TIMELINE_SOURCES = [
  'system',
  'user',
  'prefeitura',
  'sap',
  'webhook',
  'job',
  'api',
] as const;

export type FiscalNfseTimelineSource = (typeof FISCAL_NFSE_TIMELINE_SOURCES)[number];
