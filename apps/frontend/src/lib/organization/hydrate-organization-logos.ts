import { backendApiFetch } from '@/lib/backend-api-fetch';
import type { OrganizationSummary } from '@/lib/auth/types';
import {
  hydrateOrganizationsWithCachedLogos,
  setCachedOrganizationLogo,
  syncOrganizationLogoToCache,
} from '@/lib/organization/organization-logo-cache';

export async function fetchOrganizationLogo(
  organizationId: string,
): Promise<{ logo: string | null }> {
  const response = await backendApiFetch(`/organization/${organizationId}/logo`);

  if (!response.ok) {
    throw new Error('Falha ao carregar logo da organização');
  }

  return response.json() as Promise<{ logo: string | null }>;
}

type OrganizationListItem = Pick<OrganizationSummary, 'id' | 'nome' | 'slug'> & {
  logo?: string | null;
  role?: OrganizationSummary['role'];
};

export function mergeOrganizationsWithLogos(
  organizations: OrganizationListItem[],
): OrganizationSummary[] {
  return organizations.map((organization) => {
    const logo = organization.logo ?? null;
    syncOrganizationLogoToCache(organization.id, logo);

    return {
      ...organization,
      logo,
      role: organization.role ?? null,
    };
  });
}

export function hydrateOrganizationsFromLogoCache(
  organizations: OrganizationListItem[],
): OrganizationSummary[] {
  return hydrateOrganizationsWithCachedLogos(organizations).map((organization) => ({
    ...organization,
    role: organization.role ?? null,
  }));
}

export async function fetchAndCacheOrganizationLogos(
  organizationIds: string[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    organizationIds.map(async (organizationId) => {
      try {
        const { logo } = await fetchOrganizationLogo(organizationId);
        setCachedOrganizationLogo(organizationId, logo);
        return [organizationId, logo] as const;
      } catch {
        return [organizationId, undefined] as const;
      }
    }),
  );

  return Object.fromEntries(
    entries.filter((entry): entry is readonly [string, string | null] => entry[1] !== undefined),
  );
}

export function applyFetchedLogosToOrganizations(
  organizations: OrganizationSummary[],
  logosById: Record<string, string | null>,
): OrganizationSummary[] {
  if (Object.keys(logosById).length === 0) {
    return organizations;
  }

  return organizations.map((organization) => {
    const logo = logosById[organization.id];
    if (logo === undefined) {
      return organization;
    }

    syncOrganizationLogoToCache(organization.id, logo);

    return {
      ...organization,
      logo,
    };
  });
}

export async function hydrateOrganizationLogos(
  organizations: OrganizationListItem[],
): Promise<OrganizationSummary[]> {
  const merged = mergeOrganizationsWithLogos(organizations);
  const missingLogoIds = merged
    .filter((organization) => organization.logo === null)
    .map((organization) => organization.id);

  if (missingLogoIds.length === 0) {
    return merged;
  }

  const logosById = await fetchAndCacheOrganizationLogos(missingLogoIds);
  return applyFetchedLogosToOrganizations(merged, logosById);
}
