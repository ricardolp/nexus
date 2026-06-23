export const FISCAL_NFE_PEDIDO_VALIDATION_STATUSES = [
  'pending',
  'matched',
  'alert',
  'skipped',
] as const;

export type FiscalNfePedidoValidationStatus = (typeof FISCAL_NFE_PEDIDO_VALIDATION_STATUSES)[number];
