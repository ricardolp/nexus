import { queryOptions } from '@tanstack/react-query';
import { getOrganizationSettings, getOrganizations } from './service';
import type { Organization, OrganizationFilters } from './types';

export type { Organization };

export const organizationKeys = {
  all: ['admin-organizations'] as const,
  list: (filters: OrganizationFilters) =>
    [...organizationKeys.all, 'list', filters] as const,
  settings: (organizationId: string) =>
    [...organizationKeys.all, 'settings', organizationId] as const,
};

export const organizationsQueryOptions = (filters: OrganizationFilters) =>
  queryOptions({
    queryKey: organizationKeys.list(filters),
    queryFn: () => getOrganizations(filters),
  });

export const organizationSettingsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: organizationKeys.settings(organizationId),
    queryFn: () => getOrganizationSettings(organizationId),
  });
