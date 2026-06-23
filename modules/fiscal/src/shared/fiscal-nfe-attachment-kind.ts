export const FISCAL_NFE_ATTACHMENT_KINDS = [
  'xml_request',
  'xml_response',
  'xml_authorized',
  'xml_cancel',
  'xml_correction_letter',
  'xml_distribution',
  'danfe_pdf',
  'event_pdf',
  'json_payload',
  'txt_log',
  'other',
] as const;

export type FiscalNfeAttachmentKind = (typeof FISCAL_NFE_ATTACHMENT_KINDS)[number];
