'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVE_ORG_STORAGE_KEY } from '@/lib/auth/constants';
import type { AuthUser, OrganizationSummary } from '@/lib/auth/types';
import { mergeOrganizationsWithLogos } from '@/lib/organization/hydrate-organization-logos';
import {
  clearOrganizationLogoCache,
  setCachedOrganizationLogo,
} from '@/lib/organization/organization-logo-cache';

interface AuthContextValue {
  user: AuthUser | null;
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
  activeOrganizationId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<boolean>;
  patchOrganizationLogo: (organizationId: string, logo: string | null) => void;
  setActiveOrganizationId: (organizationId: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const patchOrganizationLogo = useCallback((organizationId: string, logo: string | null) => {
    setCachedOrganizationLogo(organizationId, logo);
    setOrganizations((current) =>
      current.map((organization) =>
        organization.id === organizationId ? { ...organization, logo } : organization,
      ),
    );
  }, []);

  const refreshSession = useCallback(async () => {
    const meResponse = await fetch('/api/auth/me');

    if (!meResponse.ok) {
      setUser(null);
      setOrganizations([]);
      setActiveOrganizationIdState(null);
      return false;
    }

    const currentUser = (await meResponse.json()) as AuthUser;
    setUser(currentUser);

    const orgResponse = await fetch('/api/backend/organization/me');
    if (orgResponse.ok) {
      const orgPayload = (await orgResponse.json()) as {
        items: Array<Omit<OrganizationSummary, 'logo'> & { logo?: string | null }>;
      };
      const organizationsWithLogos = mergeOrganizationsWithLogos(orgPayload.items);
      setOrganizations(organizationsWithLogos);

      const storedOrgId = window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
      const validStoredOrg = organizationsWithLogos.find((item) => item.id === storedOrgId);
      const nextOrgId = validStoredOrg?.id ?? organizationsWithLogos[0]?.id ?? null;
      setActiveOrganizationIdState(nextOrgId);

      if (nextOrgId) {
        window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, nextOrgId);
      } else {
        window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
      }
    } else {
      setOrganizations([]);
      setActiveOrganizationIdState(null);
    }

    return true;
  }, []);

  useEffect(() => {
    void refreshSession().finally(() => setIsLoading(false));
  }, [refreshSession]);

  const setActiveOrganizationId = useCallback((organizationId: string) => {
    setActiveOrganizationIdState(organizationId);
    window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, organizationId);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setOrganizations([]);
    setActiveOrganizationIdState(null);
    window.localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
    clearOrganizationLogoCache();
    router.push('/auth/sign-in');
  }, [router]);

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.id === activeOrganizationId) ?? null,
    [organizations, activeOrganizationId],
  );

  const value = useMemo(
    () => ({
      user,
      organizations,
      activeOrganization,
      activeOrganizationId,
      isLoading,
      isAuthenticated: Boolean(user),
      refreshSession,
      patchOrganizationLogo,
      setActiveOrganizationId,
      logout,
    }),
    [
      user,
      organizations,
      activeOrganization,
      activeOrganizationId,
      isLoading,
      refreshSession,
      patchOrganizationLogo,
      setActiveOrganizationId,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
