import { backendFetch } from '@/lib/server-backend';
import { applyOrganizationSearchFilter, buildOrganizationListParams } from './service.helpers';
import type { OrganizationFilters, OrganizationsResponse } from './types';

export async function getOrganizations(
  filters: OrganizationFilters,
): Promise<OrganizationsResponse> {
  const params = buildOrganizationListParams(filters);
  const response = await backendFetch(`/organization?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Falha ao carregar organizações');
  }

  const data = (await response.json()) as OrganizationsResponse;
  return applyOrganizationSearchFilter(data, filters.search);
}
