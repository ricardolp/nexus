import { parseApiError } from '@/features/organization/api/parse-api-error';
import type {
  CreateIntegrationTokenPayload,
  CreateIntegrationTokenResponse,
  CreateWebhookPayload,
  CreateWebhookResponse,
  IntegrationListFilters,
  OrganizationIntegrationSettings,
  PaginatedResponse,
  IntegrationToken,
  UpdateSapIntegrationPayload,
  UpdateWebhookPayload,
  WebhookDelivery,
  WebhookEndpoint,
} from './types';

function integrationBase(organizationId: string) {
  return `/api/backend/organization/${organizationId}/integration`;
}

async function fetchIntegrationPage<T extends { items: unknown[] }>(
  path: string,
  filters: IntegrationListFilters,
  searchFields: ((item: T['items'][number]) => string)[],
): Promise<T> {
  const params = new URLSearchParams({
    page: String(filters.page),
    perPage: String(filters.limit),
  });

  const response = await fetch(`${path}?${params.toString()}`);

  if (!response.ok) {
    await parseApiError(response, 'Falha ao carregar dados de integração');
  }

  const data = (await response.json()) as T;

  if (!filters.search) {
    return data;
  }

  const search = filters.search.toLowerCase();
  const filteredItems = data.items.filter((item) =>
    searchFields.some((getValue) => getValue(item).toLowerCase().includes(search)),
  );

  return {
    ...data,
    items: filteredItems,
    total: filteredItems.length,
  };
}

export async function getIntegrationTokens(
  organizationId: string,
  filters: IntegrationListFilters,
): Promise<PaginatedResponse<IntegrationToken>> {
  return fetchIntegrationPage<PaginatedResponse<IntegrationToken>>(
    `${integrationBase(organizationId)}/tokens`,
    filters,
    [(item) => item.name, (item) => item.tokenPrefix],
  );
}

export async function createIntegrationToken(
  organizationId: string,
  payload: CreateIntegrationTokenPayload,
): Promise<CreateIntegrationTokenResponse> {
  const response = await fetch(`${integrationBase(organizationId)}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseApiError(response, 'Falha ao criar token de integração');
  }

  return response.json();
}

export async function revokeIntegrationToken(
  organizationId: string,
  tokenId: string,
): Promise<IntegrationToken> {
  const response = await fetch(`${integrationBase(organizationId)}/tokens/${tokenId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    await parseApiError(response, 'Falha ao revogar token');
  }

  return response.json();
}

export async function getWebhooks(
  organizationId: string,
  filters: IntegrationListFilters,
): Promise<PaginatedResponse<WebhookEndpoint>> {
  return fetchIntegrationPage<PaginatedResponse<WebhookEndpoint>>(
    `${integrationBase(organizationId)}/webhooks`,
    filters,
    [(item) => item.url, (item) => item.description ?? ''],
  );
}

export async function createWebhook(
  organizationId: string,
  payload: CreateWebhookPayload,
): Promise<CreateWebhookResponse> {
  const response = await fetch(`${integrationBase(organizationId)}/webhooks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseApiError(response, 'Falha ao criar webhook');
  }

  return response.json();
}

export async function updateWebhook(
  organizationId: string,
  endpointId: string,
  payload: UpdateWebhookPayload,
): Promise<WebhookEndpoint> {
  const response = await fetch(
    `${integrationBase(organizationId)}/webhooks/${endpointId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseApiError(response, 'Falha ao atualizar webhook');
  }

  return response.json();
}

export async function deleteWebhook(
  organizationId: string,
  endpointId: string,
): Promise<void> {
  const response = await fetch(
    `${integrationBase(organizationId)}/webhooks/${endpointId}`,
    { method: 'DELETE' },
  );

  if (!response.ok) {
    await parseApiError(response, 'Falha ao remover webhook');
  }
}

export async function getWebhookDeliveries(
  organizationId: string,
  endpointId: string,
  page = 1,
  perPage = 20,
): Promise<PaginatedResponse<WebhookDelivery>> {
  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });

  const response = await fetch(
    `${integrationBase(organizationId)}/webhooks/${endpointId}/deliveries?${params.toString()}`,
  );

  if (!response.ok) {
    await parseApiError(response, 'Falha ao carregar entregas do webhook');
  }

  return response.json();
}

export async function getOrganizationIntegrationSettings(
  organizationId: string,
): Promise<OrganizationIntegrationSettings> {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/settings/integration`,
  );

  if (!response.ok) {
    await parseApiError(response, 'Falha ao carregar integração SAP');
  }

  return response.json();
}

export async function updateSapIntegrationSettings(
  organizationId: string,
  payload: UpdateSapIntegrationPayload,
): Promise<OrganizationIntegrationSettings> {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/settings/integration`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    await parseApiError(response, 'Falha ao salvar integração SAP');
  }

  const data = (await response.json()) as { integration: OrganizationIntegrationSettings };
  return data.integration;
}
