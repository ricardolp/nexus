// Human-readable labels for the fiscal inbound orchestrator's enums
// (backend/internal/inbound/status.go) — used across the "Integração"
// detail sheet (items/matching, validations, execution plan tabs).

export const itemStatusLabels: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  MATCHED: { label: 'Casado', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  NEEDS_CORRECTION: {
    label: 'Precisa de correção',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  },
  BLOCKED: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  SKIPPED: { label: 'Ignorado', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' }
};

export const matchStatusLabels: Record<string, { label: string; className: string }> = {
  MATCHED: { label: 'Encontrado', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  NOT_FOUND: { label: 'Não encontrado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  MULTIPLE_MATCH: {
    label: 'Múltiplas correspondências',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  },
  MANUAL_MAPPING: { label: 'Mapeamento manual', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  INACTIVE: { label: 'Inativo', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' }
};

export const matchTypeLabels: Record<string, string> = {
  VENDOR: 'Fornecedor',
  MATERIAL: 'Material',
  PURCHASE_ORDER: 'Pedido de compra',
  PURCHASE_ORDER_ITEM: 'Item do pedido'
};

export const validationTypeLabels: Record<string, string> = {
  VENDOR: 'Fornecedor',
  PO_REFERENCE: 'Referência de pedido',
  MATERIAL: 'Material',
  QUANTITY: 'Quantidade',
  PRICE: 'Preço unitário',
  TAX: 'Impostos'
};

export const validationStatusLabels: Record<string, { label: string; className: string }> = {
  PASS: { label: 'OK', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  WARNING: { label: 'Atenção', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  ACTION_REQUIRED: {
    label: 'Ação necessária',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  },
  OVERRIDDEN: { label: 'Corrigido manualmente', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  SKIPPED: { label: 'Não avaliado', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' }
};

const matchStatusInMessage: Record<string, string> = {
  MATCHED: 'encontrado',
  NOT_FOUND: 'não encontrado',
  MULTIPLE_MATCH: 'múltiplas correspondências',
  MANUAL_MAPPING: 'mapeamento manual',
  BLOCKED: 'bloqueado',
  INACTIVE: 'inativo'
};

/** Turns backend English validation messages into short Portuguese copy. */
export function describeValidationMessage(
  validationType: string,
  message: string | null | undefined,
  expected?: string | null,
  actual?: string | null
): string {
  const raw = (message ?? '').trim();

  const matchStatus = raw.match(/^(vendor|material|purchase.?order) match status:\s*(\w+)/i);
  if (matchStatus) {
    const statusPt = matchStatusInMessage[matchStatus[2].toUpperCase()] ?? matchStatus[2];
    if (validationType === 'MATERIAL') {
      return `Material do fornecedor ${statusPt} no SAP${expected ? ` (código NF: ${expected})` : ''}.`;
    }
    if (validationType === 'VENDOR') {
      return `Fornecedor ${statusPt} no SAP${expected ? ` (CNPJ: ${expected})` : ''}.`;
    }
    return `Correspondência ${statusPt}.`;
  }

  if (/purchase order line not found/i.test(raw)) {
    return 'Linha do pedido de compra não encontrada no SAP para comparar quantidade/preço.';
  }
  if (/no purchase order resolved/i.test(raw)) {
    return 'Nenhum pedido de compra foi resolvido para este item — comparação ignorada.';
  }
  if (/tax field extraction is not implemented/i.test(raw)) {
    return 'Extração de impostos da NF-e ainda não está disponível nesta versão.';
  }

  if (raw) return raw;

  if (expected != null && expected !== '' && actual != null && actual !== '') {
    if (validationType === 'QUANTITY') {
      return `NF: ${actual} · Pedido SAP: ${expected}`;
    }
    if (validationType === 'PRICE') {
      return `NF: ${formatMoneyish(actual)} · Pedido SAP: ${formatMoneyish(expected)}`;
    }
    return `Esperado: ${expected} · Encontrado: ${actual}`;
  }
  if (expected != null && expected !== '' && (actual == null || actual === '')) {
    return `Valor na NF: ${expected} — sem correspondente no SAP`;
  }
  if (actual != null && actual !== '') {
    return `Resolvido: ${actual}`;
  }
  return '—';
}

function formatMoneyish(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Sort key so failures surface first in the validations list. */
export function validationSeverityRank(status: string): number {
  switch (status) {
    case 'BLOCKED':
      return 0;
    case 'ACTION_REQUIRED':
      return 1;
    case 'WARNING':
      return 2;
    case 'OVERRIDDEN':
      return 3;
    case 'PASS':
      return 4;
    case 'SKIPPED':
      return 5;
    default:
      return 6;
  }
}

export const stepTypeLabels: Record<string, string> = {
  RESOLVE_VENDOR: 'Resolução de fornecedor',
  RESOLVE_MATERIAL: 'Resolução de material',
  SEARCH_PURCHASE_ORDER: 'Busca de pedido de compra',
  CREATE_PURCHASE_ORDER: 'Criar pedido de compra',
  CREATE_INBOUND_DELIVERY: 'Criar entrega de entrada',
  POST_GOODS_RECEIPT: 'Lançar recebimento (MIGO)',
  CREATE_SERVICE_ENTRY: 'Criar folha de entrada de serviço',
  POST_SUPPLIER_INVOICE: 'Lançar fatura (MIRO)',
  POST_ACCOUNTING_DOCUMENT: 'Lançar documento contábil'
};

export const stepStatusLabels: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pendente', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  READY: { label: 'Pronto', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  AWAITING_MANUAL: {
    label: 'Aguardando ação manual',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  },
  ACTION_REQUIRED: {
    label: 'Ação necessária',
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  },
  RUNNING: { label: 'Executando', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  DONE: { label: 'Concluído', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  SKIPPED: { label: 'Pulado', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  FAILED: { label: 'Falhou', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  BLOCKED: { label: 'Bloqueado', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

export function badgeFor(map: Record<string, { label: string; className: string }>, value: string) {
  return map[value] ?? { label: value, className: '' };
}
