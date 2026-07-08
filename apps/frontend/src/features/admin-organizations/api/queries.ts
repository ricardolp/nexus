import { queryOptions } from '@tanstack/react-query';
import { getOrganizationSettings, getOrganizationUsage, getOrganizations, getOrganizationsUsage } from './service';
import type { Organization, OrganizationFilters, OrganizationUsageFilters } from './types';

export type { Organization };

export const organizationKeys = {
  all: ['admin-organizations'] as const,
  list: (filters: OrganizationFilters) =>
    [...organizationKeys.all, 'list', filters] as const,
  settings: (organizationId: string) =>
    [...organizationKeys.all, 'settings', organizationId] as const,
  usage: (organizationId: string, filters: OrganizationUsageFilters) =>
    [...organizationKeys.all, 'usage', organizationId, filters] as const,
  usageList: (filters: OrganizationUsageFilters) =>
    [...organizationKeys.all, 'usage-list', filters] as const,
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

export const organizationUsageQueryOptions = (
  organizationId: string,
  filters: OrganizationUsageFilters = {},
) =>
  queryOptions({
    queryKey: organizationKeys.usage(organizationId, filters),
    queryFn: () => getOrganizationUsage(organizationId, filters),
  });

export const organizationsUsageQueryOptions = (filters: OrganizationUsageFilters = {}) =>
  queryOptions({
    queryKey: organizationKeys.usageList(filters),
    queryFn: () => getOrganizationsUsage(filters),
  });
