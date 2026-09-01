// Inbound documents (spec §32) use a richer status vocabulary than the
// simple outbound one (received/submitted/authorized/rejected/failed) —
// both coexist in the same organization_documents.status column, so this
// map covers both.
export const statusLabels: Record<string, { label: string; className: string; dot: string }> = {
  received: { label: 'Recebido', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
  xml_validated: {
    label: 'XML validado',
    className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-500'
  },
  classified: {
    label: 'Classificado',
    className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    dot: 'bg-slate-500'
  },
  matching: {
    label: 'Em correspondência',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  validating: { label: 'Validando', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  action_required: {
    label: 'Ação necessária',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500'
  },
  ready_for_posting: {
    label: 'Pronto p/ lançamento',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  executing: { label: 'Executando', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  po_created: {
    label: 'Pedido criado',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  delivery_created: {
    label: 'Remessa criada',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  gr_posted: {
    label: 'Recebimento lançado',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  invoice_posted: {
    label: 'Fatura lançada',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  completed: {
    label: 'Concluído',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500'
  },
  blocked: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  rejected: { label: 'Rejeitado', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  failed: { label: 'Falhou', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  submitted: { label: 'Enviado', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
  authorized: {
    label: 'Autorizado',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500'
  }
};

export const processingStatusLabels: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: 'Pendente', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400', dot: 'bg-slate-500' },
  queued: { label: 'Na fila', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  processing: {
    label: 'Processando',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  waiting_external: {
    label: 'Aguardando externo',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500'
  },
  retry_scheduled: {
    label: 'Nova tentativa agendada',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500'
  },
  failed: { label: 'Falhou', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' },
  completed: {
    label: 'Concluído',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500'
  }
};

export const pendingDocumentStatusLabels: Record<string, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Aguardando Ciência',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500'
  },
  manifesting: {
    label: 'Enviando Ciência',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  manifested: {
    label: 'Manifestada',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500'
  },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' }
};

export function badgeFor(
  map: Record<string, { label: string; className: string; dot: string }>,
  value: string
) {
  return map[value?.toLowerCase()] ?? { label: value, className: '', dot: 'bg-muted-foreground' };
}

export type DocumentListFilter = 'all' | 'action_needed' | 'in_progress' | 'completed' | 'problem';

const ACTION_NEEDED_STATUSES = new Set(['action_required']);
const COMPLETED_STATUSES = new Set(['completed', 'authorized']);
const PROBLEM_STATUSES = new Set(['blocked', 'rejected', 'failed']);

export function documentListBucket(status: string): Exclude<DocumentListFilter, 'all'> {
  const normalized = status.toLowerCase();
  if (ACTION_NEEDED_STATUSES.has(normalized)) return 'action_needed';
  if (COMPLETED_STATUSES.has(normalized)) return 'completed';
  if (PROBLEM_STATUSES.has(normalized)) return 'problem';
  return 'in_progress';
}

export const documentListFilterOptions: { value: DocumentListFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'action_needed', label: 'Precisa de ação' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluídas' },
  { value: 'problem', label: 'Com problema' }
];

export const fiscalQueryTypeLabels: Record<string, string> = {
  chave: 'Por chave',
  nsu: 'Por NSU',
  batch: 'Em lote'
};

export const fiscalQueryStatusLabels: Record<string, { label: string; className: string; dot: string }> = {
  pending: { label: 'Na fila', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  processing: {
    label: 'Consultando SEFAZ',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500'
  },
  completed: {
    label: 'Concluída',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500'
  },
  failed: { label: 'Falhou', className: 'bg-red-500/10 text-red-600 dark:text-red-400', dot: 'bg-red-500' }
};
