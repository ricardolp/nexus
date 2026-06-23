export const FISCAL_NFSE_ATTACHMENT_KINDS = [
  'xml_request',
  'xml_response',
  'xml_authorized',
  'xml_cancel',
  'xml_correction_letter',
  'pdf_nfse',
  'event_pdf',
  'json_payload',
  'txt_log',
  'other',
] as const;

export type FiscalNfseAttachmentKind = (typeof FISCAL_NFSE_ATTACHMENT_KINDS)[number];
