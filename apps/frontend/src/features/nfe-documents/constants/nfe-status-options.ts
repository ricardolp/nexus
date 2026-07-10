import type { NfeDocumentStatus, NfeInboundStatus, StatusInterno } from '../api/types';

export const INBOUND_STATUS_LABELS: Record<NfeInboundStatus, string> = {
  xml_imported: 'Importada por XML',
  sefaz_validated: 'Validação SEFAZ',
  pedido_validating: 'Validação pedido SAP',
  pedido_matched: 'Pedido validado',
  pedido_alert: 'Alerta — sem pedido',
  delivery_creating: 'Criando delivery',
  delivery_created: 'Entrada (delivery)',
  awaiting_portaria: 'Aguardando portaria',
  migo_pending: 'Mov. material pendente',
  migo_done: 'Mov. material realizado',
  miro_pending: 'Faturamento pendente',
  miro_done: 'Faturada',
  rejected_inbound: 'Rejeitada (não reconhecida)',
  inbound_error: 'Erro no processo',
};

export const STATUS_INTERNO_LABELS: Record<StatusInterno, string> = {
  inbound: 'Inbound',
  validada: 'Validada',
  entrada: 'Entrada',
  mov_material: 'Mov. material',
  faturada: 'Faturada',
  alerta: 'Alerta',
  rejeitada: 'Rejeitada',
  erro: 'Erro',
};

export const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  received: 'Recebida',
  validating: 'Validando',
  validation_error: 'Erro de validação',
  waiting_processing: 'Aguardando processamento',
  sent_to_sefaz: 'Enviada à SEFAZ',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  denied: 'Denegada',
  cancel_requested: 'Cancelamento solicitado',
  cancelled: 'Cancelada',
  cancel_rejected: 'Cancelamento rejeitado',
  inutilized: 'Inutilizada',
  processing_error: 'Erro de processamento',
  contingency: 'Contingência',
  closed: 'Encerrada',
  processing: 'Em processamento',
};

export const FLUXO_BADGE_CLASS = {
  inbound: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  outbound: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
} as const;

export const STATUS_BADGE_CLASS: Record<string, string> = {
  authorized: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  processing: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  draft: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

export const INBOUND_BADGE_CLASS: Record<string, string> = {
  faturada: 'bg-emerald-500/10 text-emerald-700',
  entrada: 'bg-blue-500/10 text-blue-700',
  validada: 'bg-sky-500/10 text-sky-700',
  inbound: 'bg-violet-500/10 text-violet-700',
  mov_material: 'bg-indigo-500/10 text-indigo-700',
  alerta: 'bg-amber-500/10 text-amber-700',
  rejeitada: 'bg-red-500/10 text-red-700',
  erro: 'bg-red-500/10 text-red-700',
};

export const SAP_DOC_TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Pedido de compra',
  inbound_delivery: 'Entrada (delivery)',
  goods_movement: 'Mov. material (MIGO)',
  invoice_verification: 'Faturamento (MIRO)',
  accounting_doc: 'Documento contábil',
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  authorization: 'Autorização SEFAZ',
  xml_import: 'Importação XML',
  pedido_validation: 'Validação pedido',
  sap_delivery_create: 'Criação delivery SAP',
  sap_migo: 'Lançamento MIGO',
  sap_miro: 'Faturamento MIRO',
  inbound_status_change: 'Mudança de status',
  inbound_rejection: 'Rejeição inbound',
  portaria_confirmation: 'Confirmação portaria',
  cancellation: 'Cancelamento',
  correction_letter: 'Carta de correção',
  system_status_change: 'Mudança de status (sistema)',
  status_query: 'Consulta status',
  manual_note: 'Nota manual',
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  sent: 'Enviado',
  accepted: 'Aceito',
  rejected: 'Rejeitado',
  error: 'Erro',
  ignored: 'Ignorado',
};

export const EVENT_STATUS_BADGE_CLASS: Record<string, string> = {
  accepted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  sent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rejected: 'bg-red-500/10 text-red-700 dark:text-red-300',
  error: 'bg-red-500/10 text-red-700 dark:text-red-300',
  ignored: 'bg-muted text-muted-foreground',
};

export const TIMELINE_STEP_ORDER = [
  { key: 'xml', label: 'Importada por XML', minStatus: 'xml_imported' as NfeInboundStatus },
  { key: 'sefaz', label: 'Validação SEFAZ', minStatus: 'sefaz_validated' as NfeInboundStatus },
  {
    key: 'pedido',
    label: 'Validação pedido (xPed / nItem)',
    minStatus: 'pedido_matched' as NfeInboundStatus,
  },
  {
    key: 'delivery',
    label: 'Entrada SAP (delivery)',
    minStatus: 'delivery_created' as NfeInboundStatus,
  },
  { key: 'portaria', label: 'Portaria', minStatus: 'awaiting_portaria' as NfeInboundStatus },
  { key: 'migo', label: 'Mov. material (MIGO)', minStatus: 'migo_done' as NfeInboundStatus },
  { key: 'miro', label: 'Faturada (MIRO)', minStatus: 'miro_done' as NfeInboundStatus },
] as const;

const STATUS_RANK: Record<NfeInboundStatus, number> = {
  xml_imported: 0,
  sefaz_validated: 1,
  pedido_validating: 2,
  pedido_alert: 2,
  pedido_matched: 3,
  delivery_creating: 4,
  delivery_created: 5,
  awaiting_portaria: 6,
  migo_pending: 7,
  migo_done: 8,
  miro_pending: 9,
  miro_done: 10,
  rejected_inbound: 99,
  inbound_error: 98,
};

export function inboundStatusRank(status: NfeInboundStatus): number {
  return STATUS_RANK[status] ?? 0;
}

export type InboundStepVisualState = 'done' | 'current' | 'pending' | 'warning' | 'error';

export function getInboundStepState(
  currentStatus: NfeInboundStatus,
  stepMinStatus: NfeInboundStatus,
): InboundStepVisualState {
  if (currentStatus === 'rejected_inbound') return 'error';
  if (currentStatus === 'inbound_error') {
    const currentRank = inboundStatusRank(currentStatus);
    const stepRank = inboundStatusRank(stepMinStatus);
    if (stepRank <= currentRank) return 'error';
    return 'pending';
  }
  if (currentStatus === 'pedido_alert' && stepMinStatus === 'pedido_matched') {
    return 'warning';
  }

  const currentRank = inboundStatusRank(currentStatus);
  const stepRank = inboundStatusRank(stepMinStatus);

  if (currentRank > stepRank) return 'done';
  if (currentRank === stepRank) return 'current';
  if (
    currentStatus === 'pedido_validating' &&
    stepMinStatus === 'pedido_matched'
  ) {
    return 'current';
  }
  if (
    (currentStatus === 'delivery_creating' || currentStatus === 'awaiting_portaria') &&
    stepMinStatus === 'delivery_created' &&
    currentRank >= inboundStatusRank('delivery_creating')
  ) {
    return currentRank >= stepRank ? 'done' : 'current';
  }
  if (currentStatus === 'migo_pending' && stepMinStatus === 'migo_done') {
    return 'current';
  }
  if (currentStatus === 'miro_pending' && stepMinStatus === 'miro_done') {
    return 'current';
  }
  return 'pending';
}
