export const FISCAL_NFSE_INBOUND_STATUSES = [
  'xml_imported',
  'prefeitura_validated',
  'pedido_validating',
  'pedido_matched',
  'pedido_alert',
  'delivery_creating',
  'delivery_created',
  'awaiting_portaria',
  'migo_pending',
  'migo_done',
  'miro_pending',
  'miro_done',
  'rejected_inbound',
  'inbound_error',
] as const;

export type FiscalNfseInboundStatus = (typeof FISCAL_NFSE_INBOUND_STATUSES)[number];
