import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

export function formatRelativeTime(value?: string | null) {
  if (!value) return '—';
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
}

export function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

export function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function formatCPF(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return value;
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatDocument(value?: string | null) {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 14) return formatCNPJ(digits);
  if (digits.length === 11) return formatCPF(digits);
  return value;
}

export function formatCEP(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return value || '—';
  return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export function formatCurrency(value?: number | null) {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatQuantity(value?: number | null) {
  if (value == null) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export function crtLabel(crt?: string | null) {
  switch (crt) {
    case '1':
      return 'Simples Nacional';
    case '2':
      return 'Simples — excesso';
    case '3':
      return 'Regime Normal';
    case '4':
      return 'MEI';
    default:
      return crt ? `CRT ${crt}` : null;
  }
}

export function operationTypeLabel(tpNF?: string | null) {
  if (tpNF === '0') return 'Entrada';
  if (tpNF === '1') return 'Saída';
  return null;
}

export function finalityLabel(finNFe?: string | null) {
  switch (finNFe) {
    case '1':
      return 'Normal';
    case '2':
      return 'Complementar';
    case '3':
      return 'Ajuste';
    case '4':
      return 'Devolução';
    default:
      return null;
  }
}

export function isInboundProcessing(processingStatus?: string | null) {
  const value = processingStatus?.toLowerCase();
  return value === 'queued' || value === 'processing';
}
