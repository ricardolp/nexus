const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  received: 'Recebido',
  validating: 'Validando',
  validation_error: 'Erro de validação',
  waiting_processing: 'Aguardando processamento',
  sent_to_sefaz: 'Enviado à SEFAZ',
  sent_to_prefeitura: 'Enviado à prefeitura',
  authorized: 'Autorizado',
  rejected: 'Rejeitado',
  denied: 'Denegado',
  cancel_requested: 'Cancelamento solicitado',
  cancelled: 'Cancelado',
  cancel_rejected: 'Cancelamento rejeitado',
  inutilized: 'Inutilizado',
  substituted: 'Substituído',
  processing_error: 'Erro de processamento',
  contingency: 'Contingência',
  closed: 'Encerrado',
};

const DOCUMENT_DIRECTION_LABELS: Record<string, string> = {
  inbound: 'Entrada',
  outbound: 'Saída',
};

const NFE_MODEL_LABELS: Record<string, string> = {
  '55': 'NF-e (modelo 55)',
  '65': 'NFC-e (modelo 65)',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  authorization: 'Autorização',
  cancellation: 'Cancelamento',
  cancellation_denied: 'Cancelamento negado',
  correction_letter: 'Carta de correção',
  substitution: 'Substituição',
  service_taken: 'Serviço tomado',
  manifestation_confirmation: 'Manifestação — confirmação',
  manifestation_unknown: 'Manifestação — desconhecimento',
  manifestation_not_performed: 'Manifestação — não realizada',
  manifestation_awareness: 'Manifestação — ciência',
  epec: 'EPEC',
  protocol_query: 'Consulta de protocolo',
  status_query: 'Consulta de status',
  distribution_dfe: 'Distribuição DF-e',
  xml_import: 'Importação XML',
  xml_export: 'Exportação XML',
  system_status_change: 'Mudança de status',
  webhook_callback: 'Callback webhook',
  sap_callback: 'Callback SAP',
  manual_note: 'Nota manual',
  inbound_status_change: 'Mudança status inbound',
  pedido_validation: 'Validação de pedido',
  sap_delivery_create: 'Criação delivery SAP',
  sap_migo: 'MIGO SAP',
  sap_miro: 'MIRO SAP',
  inbound_rejection: 'Rejeição inbound',
  portaria_confirmation: 'Confirmação portaria',
};

const INTEGRATION_OPERATION_LABELS: Record<string, string> = {
  purchase_orders: 'Pedidos de compra',
  inbound_delivery: 'Delivery inbound',
  inbound_miro: 'MIRO inbound',
};

export function labelDocumentStatus(status: string): string {
  return DOCUMENT_STATUS_LABELS[status] ?? status;
}

export function labelDocumentDirection(direction: string): string {
  return DOCUMENT_DIRECTION_LABELS[direction] ?? direction;
}

export function labelNfeModel(model: string): string {
  return NFE_MODEL_LABELS[model] ?? `Modelo ${model}`;
}

export function labelEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function labelIntegrationOperation(operation: string): string {
  return INTEGRATION_OPERATION_LABELS[operation] ?? operation;
}

export function sortByCountDesc(entries: [string, number][]): [string, number][] {
  return [...entries].sort((a, b) => b[1] - a[1]);
}
