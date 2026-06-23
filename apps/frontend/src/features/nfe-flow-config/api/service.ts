import type {
  FlowAuditListResponse,
  FlowConfigFull,
  FlowConfigListResponse,
  SaveFlowDraftPayload,
  TestFlowResult,
} from './types';

async function parseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({}));
  throw new Error(
    (body as { message?: string }).message ?? 'Falha na operação de fluxo NFe',
  );
}

function flowConfigBase(organizationId: string, companyId: string) {
  return `/api/backend/organization/${organizationId}/companies/${companyId}/documents/nfe/flow-config`;
}

export async function listFlowConfigs(
  organizationId: string,
  companyId: string,
  model?: string,
): Promise<FlowConfigListResponse> {
  const params = new URLSearchParams({ page: '1', perPage: '50' });
  if (model) params.set('model', model);
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}?${params}`,
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function createFlowConfigDraft(
  organizationId: string,
  companyId: string,
  model: string,
): Promise<FlowConfigFull> {
  const response = await fetch(flowConfigBase(organizationId, companyId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, seedDefault: true }),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function getFlowConfig(
  organizationId: string,
  companyId: string,
  configId: string,
): Promise<FlowConfigFull> {
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}/${configId}`,
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function saveFlowConfigDraft(
  organizationId: string,
  companyId: string,
  configId: string,
  payload: SaveFlowDraftPayload,
): Promise<FlowConfigFull> {
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}/${configId}/draft`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function publishFlowConfig(
  organizationId: string,
  companyId: string,
  configId: string,
  reason?: string,
): Promise<FlowConfigFull> {
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}/${configId}/publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    },
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function testFlowConfig(
  organizationId: string,
  companyId: string,
  configId: string,
  input: { accessKey?: string; purchaseOrder?: string },
): Promise<TestFlowResult> {
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}/${configId}/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function getFlowConfigHistory(
  organizationId: string,
  companyId: string,
  configId: string,
): Promise<FlowAuditListResponse> {
  const response = await fetch(
    `${flowConfigBase(organizationId, companyId)}/${configId}/history?page=1&perPage=20`,
  );
  if (!response.ok) await parseError(response);
  return response.json();
}
