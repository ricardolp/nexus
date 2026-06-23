export const FISCAL_NFSE_PEDIDO_VALIDATION_STATUSES = [
  'pending',
  'matched',
  'alert',
  'skipped',
] as const;

export type FiscalNfsePedidoValidationStatus = (typeof FISCAL_NFSE_PEDIDO_VALIDATION_STATUSES)[number];
