export const WEBHOOK_EVENT_TYPES = [
  'nfe.document.created',
  'nfe.document.sent_to_sefaz',
  'nfe.document.authorized',
  'nfe.document.rejected',
  'nfe.document.cancelled',
  'nfe.document.updated',
  'nfe.document_event.created',
  'nfe.document_event.accepted',
  'nfe.document_event.rejected',
  'nfe.item.created',
  'nfe.item.pedido_validated',
  'nfe.timeline.created',
  'nfe.attachment.created',
  'nfe.inbound.status_changed',
  'nfe.sap_document.created',
  'nfe.number_range.created',
  'nfe.number_range.inutilized',
  'nfe.number_range_event.created',
  'nfse.document.created',
  'nfse.document.sent_to_prefeitura',
  'nfse.document.authorized',
  'nfse.document.rejected',
  'nfse.document.cancelled',
  'nfse.document.updated',
  'nfse.document_event.created',
  'nfse.document_event.accepted',
  'nfse.document_event.rejected',
  'nfse.item.created',
  'nfse.item.pedido_validated',
  'nfse.timeline.created',
  'nfse.attachment.created',
  'nfse.inbound.status_changed',
  'nfse.sap_document.created',
  'nfse.number_range.created',
  'nfse.number_range.inutilized',
  'nfse.number_range_event.created',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookPayload<T = Record<string, unknown>> {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  organizationId: string;
  data: T;
}
