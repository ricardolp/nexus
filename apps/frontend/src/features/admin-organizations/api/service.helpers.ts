import type { OrganizationFilters, OrganizationsResponse } from './types';

export function applyOrganizationSearchFilter(
  data: OrganizationsResponse,
  search?: string,
): OrganizationsResponse {
  if (!search) {
    return data;
  }

  const normalizedSearch = search.toLowerCase();
  const filteredItems = data.items.filter(
    (item) =>
      item.nome.toLowerCase().includes(normalizedSearch) ||
      item.slug.toLowerCase().includes(normalizedSearch),
  );

  return {
    ...data,
    items: filteredItems,
    total: filteredItems.length,
  };
}

export function buildOrganizationListParams(filters: OrganizationFilters): URLSearchParams {
  return new URLSearchParams({
    page: String(filters.page),
    perPage: String(filters.limit),
  });
}
