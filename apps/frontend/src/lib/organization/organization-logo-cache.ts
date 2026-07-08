import { ORGANIZATION_LOGO_CACHE_KEY } from '@/lib/auth/constants';

const CACHE_STORAGE_KEY = ORGANIZATION_LOGO_CACHE_KEY;

interface LogoCacheEntry {
  logo: string | null;
  updatedAt: number;
}

type LogoCache = Record<string, LogoCacheEntry>;

function readCache(): LogoCache {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    return JSON.parse(raw) as LogoCache;
  } catch {
    return {};
  }
}

function writeCache(cache: LogoCache): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
}

export function getCachedOrganizationLogo(
  organizationId: string,
): string | null | undefined {
  const entry = readCache()[organizationId];
  if (!entry) {
    return undefined;
  }

  return entry.logo;
}

export function setCachedOrganizationLogo(
  organizationId: string,
  logo: string | null,
): void {
  const cache = readCache();
  cache[organizationId] = {
    logo,
    updatedAt: Date.now(),
  };
  writeCache(cache);
}

export function removeCachedOrganizationLogo(organizationId: string): void {
  const cache = readCache();
  delete cache[organizationId];
  writeCache(cache);
}

export function clearOrganizationLogoCache(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(CACHE_STORAGE_KEY);
}

export function syncOrganizationLogoToCache(
  organizationId: string,
  logo: string | null | undefined,
): void {
  if (logo === undefined) {
    return;
  }

  setCachedOrganizationLogo(organizationId, logo);
}

export function hydrateOrganizationWithCachedLogo<T extends { id: string; logo?: string | null }>(
  organization: T,
): T & { logo: string | null } {
  const cached = getCachedOrganizationLogo(organization.id);

  return {
    ...organization,
    logo: organization.logo ?? cached ?? null,
  };
}

export function hydrateOrganizationsWithCachedLogos<T extends { id: string; logo?: string | null }>(
  organizations: T[],
): Array<T & { logo: string | null }> {
  return organizations.map(hydrateOrganizationWithCachedLogo);
}
