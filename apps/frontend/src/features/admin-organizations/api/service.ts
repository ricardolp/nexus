import type {
  CreateOrganizationUserPayload,
  OrganizationFilters,
  OrganizationSettings,
  OrganizationsResponse,
  UpdateOrganizationSettingsPayload,
} from './types';

export async function getOrganizations(
  filters: OrganizationFilters,
): Promise<OrganizationsResponse> {
  const params = new URLSearchParams({
    page: String(filters.page),
    perPage: String(filters.limit),
  });

  const response = await fetch(`/api/backend/organization?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Falha ao carregar organizações');
  }

  const data = (await response.json()) as OrganizationsResponse;

  if (!filters.search) {
    return data;
  }

  const search = filters.search.toLowerCase();
  const filteredItems = data.items.filter(
    (item) =>
      item.nome.toLowerCase().includes(search) || item.slug.toLowerCase().includes(search),
  );

  return {
    ...data,
    items: filteredItems,
    total: filteredItems.length,
  };
}

export async function createOrganizationUser(
  organizationId: string,
  payload: CreateOrganizationUserPayload,
) {
  const response = await fetch(
    `/api/backend/organization/${organizationId}/members/create-user`,
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
  const response = await fetch(`/api/backend/organization/${organizationId}/settings`);

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
  const response = await fetch(`/api/backend/organization/${organizationId}/settings`, {
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
