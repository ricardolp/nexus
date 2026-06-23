export const FISCAL_DOCUMENT_DIRECTIONS = ['inbound', 'outbound'] as const;

export type FiscalDocumentDirection =
  (typeof FISCAL_DOCUMENT_DIRECTIONS)[number];
