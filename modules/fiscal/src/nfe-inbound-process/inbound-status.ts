import {
  FiscalNfeInboundStatus,
  FISCAL_NFE_INBOUND_STATUSES,
} from '../shared/fiscal-nfe-inbound-status';

export type NfeInboundStatus = FiscalNfeInboundStatus;

export type StatusInterno =
  | 'inbound'
  | 'validada'
  | 'entrada'
  | 'mov_material'
  | 'faturada'
  | 'alerta'
  | 'rejeitada'
  | 'erro';

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

export function mapInboundToStatusInterno(status: NfeInboundStatus): StatusInterno {
  switch (status) {
    case 'xml_imported':
    case 'sefaz_validated':
      return 'inbound';
    case 'pedido_validating':
    case 'pedido_matched':
      return 'validada';
    case 'pedido_alert':
      return 'alerta';
    case 'delivery_creating':
    case 'delivery_created':
    case 'awaiting_portaria':
    case 'migo_pending':
      return 'entrada';
    case 'migo_done':
      return 'mov_material';
    case 'miro_pending':
      return 'mov_material';
    case 'miro_done':
      return 'faturada';
    case 'rejected_inbound':
      return 'rejeitada';
    case 'inbound_error':
      return 'erro';
    default:
      return 'inbound';
  }
}

const ALLOWED_TRANSITIONS: Record<NfeInboundStatus, NfeInboundStatus[]> = {
  xml_imported: ['sefaz_validated'],
  sefaz_validated: ['pedido_validating', 'rejected_inbound'],
  pedido_validating: ['pedido_matched', 'pedido_alert', 'inbound_error'],
  pedido_matched: ['delivery_creating', 'rejected_inbound', 'pedido_alert'],
  pedido_alert: ['rejected_inbound', 'pedido_validating'],
  delivery_creating: ['delivery_created', 'awaiting_portaria', 'inbound_error'],
  delivery_created: ['awaiting_portaria', 'inbound_error'],
  awaiting_portaria: ['migo_pending', 'migo_done', 'rejected_inbound'],
  migo_pending: ['migo_done', 'inbound_error'],
  migo_done: ['miro_pending'],
  miro_pending: ['miro_done', 'inbound_error'],
  miro_done: [],
  rejected_inbound: [],
  inbound_error: [
    'pedido_validating',
    'delivery_creating',
    'miro_pending',
    'pedido_matched',
  ],
};

export function canTransitionInbound(
  from: NfeInboundStatus,
  to: NfeInboundStatus,
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export const TIMELINE_STEP_ORDER: {
  key: string;
  label: string;
  minStatus: NfeInboundStatus;
}[] = [
  { key: 'xml', label: 'Importada por XML', minStatus: 'xml_imported' },
  { key: 'sefaz', label: 'Validação SEFAZ', minStatus: 'sefaz_validated' },
  {
    key: 'pedido',
    label: 'Validação pedido (xPed / nItem)',
    minStatus: 'pedido_matched',
  },
  { key: 'delivery', label: 'Entrada SAP (delivery)', minStatus: 'delivery_created' },
  { key: 'portaria', label: 'Portaria', minStatus: 'awaiting_portaria' },
  { key: 'migo', label: 'Mov. material (MIGO)', minStatus: 'migo_done' },
  { key: 'miro', label: 'Faturada (MIRO)', minStatus: 'miro_done' },
];

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

export function getStatusesForStatusInterno(
  statusInterno: StatusInterno,
): NfeInboundStatus[] {
  return FISCAL_NFE_INBOUND_STATUSES.filter(
    (s: FiscalNfeInboundStatus) =>
      mapInboundToStatusInterno(s) === statusInterno,
  );
}
