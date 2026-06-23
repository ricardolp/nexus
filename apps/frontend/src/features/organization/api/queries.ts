import { queryOptions } from '@tanstack/react-query';
import {
  getOrganizationCompanies,
  getOrganizationCompanyCertificates,
  getOrganizationMembers,
  getOrganizationRoles,
} from './service';
import type { OrganizationListFilters } from './types';

export const organizationKeys = {
  all: ['organization'] as const,
  members: (organizationId: string, filters: OrganizationListFilters) =>
    [...organizationKeys.all, 'members', organizationId, filters] as const,
  companies: (organizationId: string, filters: OrganizationListFilters) =>
    [...organizationKeys.all, 'companies', organizationId, filters] as const,
  certificates: (organizationId: string, companyId: string) =>
    [...organizationKeys.all, 'certificates', organizationId, companyId] as const,
  roles: (organizationId: string, filters: OrganizationListFilters) =>
    [...organizationKeys.all, 'roles', organizationId, filters] as const,
};

export const organizationMembersQueryOptions = (
  organizationId: string,
  filters: OrganizationListFilters,
) =>
  queryOptions({
    queryKey: organizationKeys.members(organizationId, filters),
    queryFn: () => getOrganizationMembers(organizationId, filters),
  });

export const organizationCompaniesQueryOptions = (
  organizationId: string,
  filters: OrganizationListFilters,
) =>
  queryOptions({
    queryKey: organizationKeys.companies(organizationId, filters),
    queryFn: () => getOrganizationCompanies(organizationId, filters),
  });

export const organizationCompanyCertificatesQueryOptions = (
  organizationId: string,
  companyId: string,
) =>
  queryOptions({
    queryKey: organizationKeys.certificates(organizationId, companyId),
    queryFn: () => getOrganizationCompanyCertificates(organizationId, companyId),
  });

export const organizationRolesQueryOptions = (
  organizationId: string,
  filters: OrganizationListFilters,
) =>
  queryOptions({
    queryKey: organizationKeys.roles(organizationId, filters),
    queryFn: () => getOrganizationRoles(organizationId, filters),
  });
