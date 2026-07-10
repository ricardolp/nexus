import type {
  ImportNfeDocumentPayload,
  ImportNfeDocumentResponse,
  NfeDocumentAttachment,
  NfeDocumentEvent,
  NfeDocumentItem,
  NfeDocumentListFilters,
  NfeDocumentListItem,
  NfeDocumentsListResponse,
  NfeDocumentsSummary,
  NfeDocumentTimeline,
  NfeFlowInstance,
  NfeInboundProcess,
  NfeOrganizationEvent,
  NfeOrganizationEventsListFilters,
  NfeOrganizationEventsListResponse,
  NfeSapDocument,
  PaginatedResponse,
  RegisterMigoPayload,
  SapRetryStep,
} from './types';

async function parseError(response: Response, fallback: string): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new Error((body as { message?: string }).message ?? fallback);
}

function nfeBase(organizationId: string) {
  return `/api/backend/organization/${organizationId}/documents/nfe`;
}

function buildListParams(filters: NfeDocumentListFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  params.set('perPage', String(filters.perPage ?? 20));
  if (filters.direction && filters.direction !== 'all') {
    params.set('direction', filters.direction);
  }
  if (filters.search) params.set('search', filters.search);
  if (filters.inboundStatus) params.set('inboundStatus', filters.inboundStatus);
  if (filters.companyId) params.set('companyId', filters.companyId);
  return params;
}

export async function listNfeDocuments(
  organizationId: string,
  filters: NfeDocumentListFilters = {},
): Promise<NfeDocumentsListResponse> {
  const params = buildListParams(filters);
  const response = await fetch(`${nfeBase(organizationId)}?${params}`);
  if (!response.ok) await parseError(response, 'Falha ao listar notas fiscais');
  return response.json();
}

export async function getNfeDocumentsSummary(
  organizationId: string,
  companyId?: string,
): Promise<NfeDocumentsSummary> {
  const params = new URLSearchParams();
  if (companyId) params.set('companyId', companyId);
  const query = params.toString();
  const response = await fetch(
    `${nfeBase(organizationId)}/summary${query ? `?${query}` : ''}`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar resumo');
  return response.json();
}

export async function getNfeDocument(
  organizationId: string,
  documentId: string,
): Promise<NfeDocumentListItem> {
  const response = await fetch(`${nfeBase(organizationId)}/${documentId}`);
  if (!response.ok) await parseError(response, 'Nota fiscal não encontrada');
  return response.json();
}

export async function getNfeInboundProcess(
  organizationId: string,
  documentId: string,
): Promise<NfeInboundProcess | null> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/inbound-process`,
  );
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) await parseError(response, 'Falha ao carregar processo inbound');
  return response.json();
}

export async function listNfeDocumentItems(
  organizationId: string,
  documentId: string,
): Promise<PaginatedResponse<NfeDocumentItem>> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/items?page=1&perPage=200`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar itens');
  return response.json();
}

export async function listNfeDocumentEvents(
  organizationId: string,
  documentId: string,
): Promise<PaginatedResponse<NfeDocumentEvent>> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/events?page=1&perPage=100`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar eventos');
  return response.json();
}

function buildEventsListParams(filters: NfeOrganizationEventsListFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  params.set('perPage', String(filters.perPage ?? 20));
  if (filters.eventType) params.set('eventType', filters.eventType);
  if (filters.eventStatus) params.set('eventStatus', filters.eventStatus);
  if (filters.search) params.set('search', filters.search);
  return params;
}

export async function listOrganizationNfeEvents(
  organizationId: string,
  filters: NfeOrganizationEventsListFilters = {},
): Promise<NfeOrganizationEventsListResponse> {
  const params = buildEventsListParams(filters);
  const response = await fetch(`${nfeBase(organizationId)}/events?${params}`);
  if (!response.ok) await parseError(response, 'Falha ao listar eventos');
  return response.json();
}

export async function getOrganizationNfeEvent(
  organizationId: string,
  eventId: string,
): Promise<NfeOrganizationEvent> {
  const response = await fetch(`${nfeBase(organizationId)}/events/${eventId}`);
  if (!response.ok) await parseError(response, 'Evento não encontrado');
  return response.json();
}

export async function listNfeDocumentTimeline(
  organizationId: string,
  documentId: string,
): Promise<PaginatedResponse<NfeDocumentTimeline>> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/timeline?page=1&perPage=100`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar histórico');
  return response.json();
}

export async function listNfeDocumentAttachments(
  organizationId: string,
  documentId: string,
): Promise<PaginatedResponse<NfeDocumentAttachment>> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/attachments?page=1&perPage=50`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar anexos');
  return response.json();
}

export async function listNfeSapDocuments(
  organizationId: string,
  documentId: string,
): Promise<PaginatedResponse<NfeSapDocument>> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/sap-documents?page=1&perPage=100`,
  );
  if (!response.ok) await parseError(response, 'Falha ao carregar documentos SAP');
  return response.json();
}

export async function getNfeFlowInstance(
  organizationId: string,
  documentId: string,
): Promise<NfeFlowInstance | null> {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/documents/nfe/${documentId}/flow-instance`,
  );
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) await parseError(response, 'Falha ao carregar instância de fluxo');
  return response.json();
}

export async function importNfeDocument(
  organizationId: string,
  payload: ImportNfeDocumentPayload,
): Promise<ImportNfeDocumentResponse> {
  const formData = new FormData();
  formData.append('file', payload.file);
  const params = payload.companyId
    ? `?companyId=${encodeURIComponent(payload.companyId)}`
    : '';
  const response = await fetch(`${nfeBase(organizationId)}/import${params}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) await parseError(response, 'Falha ao importar XML');
  return response.json();
}

export async function confirmPortaria(
  organizationId: string,
  documentId: string,
): Promise<NfeInboundProcess> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/confirm-portaria`,
    { method: 'POST' },
  );
  if (!response.ok) await parseError(response, 'Falha ao confirmar portaria');
  return response.json();
}

export async function registerMigo(
  organizationId: string,
  documentId: string,
  payload: RegisterMigoPayload = {},
): Promise<NfeInboundProcess> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/register-migo`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) await parseError(response, 'Falha ao registrar MIGO');
  return response.json();
}

export async function rejectInbound(
  organizationId: string,
  documentId: string,
  reason: string,
): Promise<NfeInboundProcess> {
  const response = await fetch(`${nfeBase(organizationId)}/${documentId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) await parseError(response, 'Falha ao rejeitar nota');
  return response.json();
}

export async function retrySapStep(
  organizationId: string,
  documentId: string,
  step: SapRetryStep,
): Promise<NfeInboundProcess> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/retry-sap-step`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
    },
  );
  if (!response.ok) await parseError(response, 'Falha ao reprocessar etapa SAP');
  return response.json();
}

export async function reprocessInbound(
  organizationId: string,
  documentId: string,
  runInline = false,
): Promise<NfeInboundProcess> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/reprocess-inbound`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runInline }),
    },
  );
  if (!response.ok) await parseError(response, 'Falha ao reprocessar inbound');
  return response.json();
}

export type ResetInboundResponse = {
  documentId: string;
  inboundStatus: NfeInboundProcess['inboundStatus'];
  removedSapDocuments: number;
};

export async function resetInbound(
  organizationId: string,
  documentId: string,
): Promise<ResetInboundResponse> {
  const response = await fetch(
    `${nfeBase(organizationId)}/${documentId}/reset-inbound`,
    { method: 'POST' },
  );
  if (!response.ok) await parseError(response, 'Falha ao resetar documento');
  return response.json();
}

export type DeleteNfeDocumentResponse = {
  documentId: string;
};

export async function deleteNfeDocument(
  organizationId: string,
  documentId: string,
): Promise<DeleteNfeDocumentResponse> {
  const response = await fetch(`${nfeBase(organizationId)}/${documentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) await parseError(response, 'Falha ao eliminar documento');
  return response.json();
}
