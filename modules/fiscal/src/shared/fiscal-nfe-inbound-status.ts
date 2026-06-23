export const FISCAL_NFE_INBOUND_STATUSES = [
  'xml_imported',
  'sefaz_validated',
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

export type FiscalNfeInboundStatus = (typeof FISCAL_NFE_INBOUND_STATUSES)[number];
