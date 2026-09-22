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

export function inboundHasGeneratedSAPDocument(
  steps?: Array<{ sap_document_number?: string | null }> | null
) {
  return (steps ?? []).some((step) => Boolean(step.sap_document_number?.trim()));
}

/** Reset is allowed when the inbound NF-e has progressed past import and no SAP document was posted. */
export function canResetInboundDocument(
  document: { direction?: string | null; document_type?: string | null; status?: string | null; processing_status?: string | null },
  steps?: Array<{ sap_document_number?: string | null }> | null,
  hasGeneratedSAPDocument?: boolean
) {
  if (document.direction?.toLowerCase() !== 'inbound') return false;
  if (document.document_type?.toLowerCase() !== 'nfe') return false;
  if (isInboundProcessing(document.processing_status)) return false;
  if (hasGeneratedSAPDocument || inboundHasGeneratedSAPDocument(steps)) return false;
  return document.status?.toLowerCase() !== 'received';
}

/** True while the hop tracker (and the detail page) should keep polling. */
export function isDocumentInFlight(processingStatus?: string | null) {
  const value = processingStatus?.toLowerCase();
  return (
    value === 'queued' ||
    value === 'processing' ||
    value === 'waiting_external' ||
    value === 'retry_scheduled'
  );
}

/** Short stamp under a hop node, e.g. "01/09, 18:06". */
export function formatHopTime(value?: string | null) {
  if (!value) return undefined;
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function sourceSystemLabel(source?: string | null) {
  const value = (source ?? '').trim().toLowerCase();
  if (value === 'nexus_ui') return 'Web';
  if (value === 'manual_upload') return 'Upload';
  if (value === 'nfe_gateway_distribution' || value.startsWith('nfe_gateway')) return 'SEFAZ';
  return source || '—';
}

export function issqnTributeLabel(nature?: string | null) {
  switch ((nature ?? '').trim()) {
    case '3':
      return 'Imunidade';
    case '4':
      return 'Exportação de serviço';
    case '5':
    case '6':
      return 'Não incidência';
    case '1':
    case '2':
      return 'Operação tributável';
    default:
      return nature ? `Natureza ${nature}` : null;
  }
}

export function issqnRetentionLabel(withheld?: boolean | null) {
  if (withheld) return 'Retido pelo tomador';
  return 'Não retido';
}

export function pisCofinsRetentionLabel(code?: string | null) {
  const value = (code ?? '').trim();
  if (value === '1') return 'Retido';
  if (value === '0' || value === '') return 'Não retido';
  return `Tipo ${value}`;
}
