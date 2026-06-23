export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function getTokenStatus(token: {
  revokedAt: string | null;
  expiresAt: string | null;
}): 'active' | 'revoked' | 'expired' {
  if (token.revokedAt) return 'revoked';
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  return 'active';
}

export const TOKEN_STATUS_LABELS = {
  active: 'Ativo',
  revoked: 'Revogado',
  expired: 'Expirado',
} as const;

export const WEBHOOK_DELIVERY_STATUS_LABELS = {
  pending: 'Pendente',
  delivered: 'Entregue',
  failed: 'Falhou',
} as const;
