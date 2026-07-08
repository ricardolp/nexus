import { backendApiFetch } from '@/lib/backend-api-fetch';
import { hydrateOrganizationLogos } from '@/lib/organization/hydrate-organization-logos';
import { applyOrganizationSearchFilter, buildOrganizationListParams } from './service.helpers';
import type {
  CreateOrganizationPayload,
  CreateOrganizationUserPayload,
  OrganizationFilters,
  OrganizationSettings,
  OrganizationUsage,
  OrganizationUsageFilters,
  OrganizationUsageList,
  OrganizationsResponse,
  UpdateOrganizationPayload,
  UpdateOrganizationSettingsPayload,
} from './types';

export async function getOrganizations(
  filters: OrganizationFilters,
): Promise<OrganizationsResponse> {
  const params = buildOrganizationListParams(filters);
  const response = await backendApiFetch(`/organization?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Falha ao carregar organizações');
  }

  const data = (await response.json()) as OrganizationsResponse;
  const filtered = applyOrganizationSearchFilter(data, filters.search);
  const hydratedItems = await hydrateOrganizationLogos(filtered.items);

  return {
    ...filtered,
    items: hydratedItems.map(({ id, nome, slug, logo }) => ({ id, nome, slug, logo })),
  };
}

export async function createOrganization(payload: CreateOrganizationPayload) {
  const response = await backendApiFetch('/organization', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao criar organização');
  }

  return response.json();
}

export async function updateOrganization(
  organizationId: string,
  payload: UpdateOrganizationPayload,
) {
  const response = await backendApiFetch(`/organization/${organizationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao atualizar organização');
  }

  return response.json();
}

export async function createOrganizationUser(
  organizationId: string,
  payload: CreateOrganizationUserPayload,
) {
  const response = await backendApiFetch(
    `/organization/${organizationId}/members/create-user`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao criar usuário');
  }

  return response.json();
}

export async function getOrganizationSettings(
  organizationId: string,
): Promise<OrganizationSettings> {
  const response = await backendApiFetch(`/organization/${organizationId}/settings`);

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao carregar configurações');
  }

  return response.json();
}

export async function updateOrganizationSettings(
  organizationId: string,
  payload: UpdateOrganizationSettingsPayload,
): Promise<OrganizationSettings> {
  const response = await backendApiFetch(`/organization/${organizationId}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao atualizar configurações');
  }

  return response.json();
}

export async function getOrganizationsUsage(
  filters: OrganizationUsageFilters = {},
): Promise<OrganizationUsageList> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const query = params.toString();
  const response = await backendApiFetch(
    `/organization/usage${query ? `?${query}` : ''}`,
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao carregar indicadores de uso');
  }

  return response.json();
}

export async function getOrganizationUsage(
  organizationId: string,
  filters: OrganizationUsageFilters = {},
): Promise<OrganizationUsage> {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);

  const query = params.toString();
  const response = await backendApiFetch(
    `/organization/${organizationId}/usage${query ? `?${query}` : ''}`,
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? 'Falha ao carregar indicadores de uso');
  }

  return response.json();
}
