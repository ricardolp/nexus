export const FISCAL_NFSE_EVENT_TYPES = [
  'authorization',
  'cancellation',
  'cancellation_denied',
  'correction_letter',
  'substitution',
  'service_taken',
  'xml_import',
  'xml_export',
  'system_status_change',
  'webhook_callback',
  'sap_callback',
  'manual_note',
  'inbound_status_change',
  'pedido_validation',
  'sap_delivery_create',
  'sap_migo',
  'sap_miro',
  'inbound_rejection',
  'portaria_confirmation',
] as const;

export type FiscalNfseEventType = (typeof FISCAL_NFSE_EVENT_TYPES)[number];
