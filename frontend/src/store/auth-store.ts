import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { ApiError } from '@/lib/api';
import {
  getMe,
  getOrganization,
  login as apiLogin,
  logout as apiLogout,
  refreshAuthToken,
  verifyMfaLogin
} from '@/lib/endpoints';
import type { ApiOrganization, ApiUser, LoginResponse, PlatformRole } from '@/lib/api-types';

export type UserRole = 'admin' | 'user';

function isPlatformStaffRole(role: PlatformRole | string | undefined): boolean {
  return role === 'admin' || role === 'system' || role === 'support';
}

export interface AuthUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  status: string;
  role: UserRole;
  displayName?: string | null;
  hasAvatar?: boolean;
  mfaEnabled?: boolean;
  appearance?: Record<string, unknown> | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  user: AuthUser | null;
  organizationId: string | null;
  organization: ApiOrganization | null;
  orgLoadError: string | null;
  mfaSetupRequired: boolean;
  pendingMfaChallenge: string | null;
  rememberBrowser: boolean;
  loginAsAdmin: (email: string, password: string, rememberBrowser?: boolean) => Promise<'ok' | 'mfa' | 'mfa_setup'>;
  loginAsMember: (email: string, password: string, rememberBrowser?: boolean) => Promise<'ok' | 'mfa' | 'mfa_setup'>;
  hydrateSession: () => Promise<boolean>;
  completeMfa: (code: string, asAdmin: boolean) => Promise<'ok' | 'mfa_setup'>;
  completeMfaSetup: () => void;
  clearMfaChallenge: () => void;
  applySession: (res: LoginResponse, role: UserRole) => Promise<'ok' | 'mfa_setup'>;
  refreshSession: () => Promise<boolean>;
  signOut: () => void;
  setUserProfile: (user: ApiUser) => void;
  setOrganization: (organization: ApiOrganization) => void;
}

function displayNameFromEmail(email: string) {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mapUser(apiUser: ApiUser, role: UserRole): AuthUser {
  return {
    id: apiUser.id,
    email: apiUser.email,
    platformRole: apiUser.platform_role,
    status: apiUser.status,
    role,
    displayName: apiUser.display_name,
    hasAvatar: apiUser.has_avatar,
    mfaEnabled: apiUser.mfa_enabled,
    appearance: (apiUser.appearance_json as Record<string, unknown> | null) ?? null
  };
}

async function finishLogin(
  res: LoginResponse,
  role: UserRole,
  set: (partial: Partial<AuthState>) => void
): Promise<'ok' | 'mfa_setup'> {
  if (!res.user) {
    throw new ApiError({
      type: 'about:blank',
      title: 'Erro',
      status: 500,
      code: 'invalid_login_response',
      detail: 'Resposta de login incompleta.',
      trace_id: ''
    });
  }
  set({
    token: 'cookie',
    refreshToken: null,
    tokenExpiresAt: res.expires_at ?? null,
    user: mapUser(res.user, role),
    organizationId: res.organization_id ?? null,
    organization: null,
    orgLoadError: null,
    mfaSetupRequired: !!res.mfa_setup_required,
    pendingMfaChallenge: null
  });

  if (res.organization_id) {
    try {
      const org = await getOrganization('cookie', res.organization_id);
      set({ organization: org });
    } catch (err) {
      set({
        orgLoadError: err instanceof ApiError ? err.message : 'Não foi possível carregar a organização.'
      });
    }
  }

  return res.mfa_setup_required ? 'mfa_setup' : 'ok';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      tokenExpiresAt: null,
      user: null,
      organizationId: null,
      organization: null,
      orgLoadError: null,
      mfaSetupRequired: false,
      pendingMfaChallenge: null,
      rememberBrowser: true,

      applySession: (res, role) => finishLogin(res, role, set),

      loginAsAdmin: async (email, password, rememberBrowser = true) => {
        const res = await apiLogin(email, password, rememberBrowser);
        if (res.mfa_required) {
          set({ pendingMfaChallenge: res.challenge_token || 'pending', rememberBrowser });
          return 'mfa';
        }
        if (res.user && !isPlatformStaffRole(res.user.platform_role)) {
          throw new ApiError({
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            code: 'admin_only',
            detail: 'Esta área é exclusiva para a equipe da plataforma (admin, sistema ou suporte).',
            trace_id: ''
          });
        }
        return finishLogin(res, 'admin', set);
      },

      loginAsMember: async (email, password, rememberBrowser = true) => {
        const res = await apiLogin(email, password, rememberBrowser);
        if (res.mfa_required) {
          set({ pendingMfaChallenge: res.challenge_token || 'pending', rememberBrowser });
          return 'mfa';
        }
        if (res.user && res.user.platform_role !== 'member') {
          const detail =
            res.user.platform_role === 'admin' ||
            res.user.platform_role === 'system' ||
            res.user.platform_role === 'support'
              ? 'Esta conta é de administrador da plataforma. Entre pelo painel admin em /admin/login.'
              : 'Apenas membros de uma organização podem acessar esta área.';
          throw new ApiError({
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            code: 'members_only',
            detail,
            trace_id: ''
          });
        }
        return finishLogin(res, 'user', set);
      },

      completeMfa: async (code, asAdmin) => {
        const challenge = get().pendingMfaChallenge;
        if (!challenge) {
          throw new ApiError({
            type: 'about:blank',
            title: 'Erro',
            status: 400,
            code: 'mfa_challenge_missing',
            detail: 'Desafio MFA ausente. Faça login novamente.',
            trace_id: ''
          });
        }
        const res = await verifyMfaLogin(challenge === 'pending' ? '' : challenge, code, get().rememberBrowser);
        if (asAdmin) {
          if (res.user && !isPlatformStaffRole(res.user.platform_role)) {
            throw new ApiError({
              type: 'about:blank',
              title: 'Forbidden',
              status: 403,
              code: 'admin_only',
              detail: 'Esta área é exclusiva para a equipe da plataforma (admin, sistema ou suporte).',
              trace_id: ''
            });
          }
          return finishLogin(res, 'admin', set);
        }
        if (res.user && res.user.platform_role !== 'member') {
          throw new ApiError({
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            code: 'members_only',
            detail: 'Apenas membros de uma organização podem acessar esta área.',
            trace_id: ''
          });
        }
        return finishLogin(res, 'user', set);
      },

      completeMfaSetup: () =>
        set((state) => ({
          mfaSetupRequired: false,
          user: state.user ? { ...state.user, mfaEnabled: true } : state.user
        })),

      clearMfaChallenge: () => set({ pendingMfaChallenge: null }),

      refreshSession: async () => {
        try {
          const res = await refreshAuthToken();
          if (!res.user) return false;
          const role = get().user?.role ?? (res.user.platform_role === 'member' ? 'user' : 'admin');
          set({
            token: 'cookie',
            refreshToken: null,
            tokenExpiresAt: res.expires_at ?? null,
            user: mapUser(res.user, role),
            organizationId: res.organization_id ?? get().organizationId
          });
          return true;
        } catch {
          return false;
        }
      },

      hydrateSession: async () => {
        try {
          const me = await getMe();
          if (!me.user) return false;
          const role = get().user?.role ?? (me.user.platform_role === 'member' ? 'user' : 'admin');
          set({
            token: 'cookie',
            refreshToken: null,
            user: mapUser(me.user, role),
            organizationId: me.organization_id ?? get().organizationId,
            mfaSetupRequired: me.purpose === 'mfa_setup' || get().mfaSetupRequired
          });
          if (me.organization_id && !get().organization) {
            try {
              const org = await getOrganization('cookie', me.organization_id);
              set({ organization: org, orgLoadError: null });
            } catch (err) {
              set({
                orgLoadError: err instanceof ApiError ? err.message : 'Não foi possível carregar a organização.'
              });
            }
          }
          return true;
        } catch {
          const ok = await get().refreshSession();
          if (!ok) {
            set({
              token: null,
              refreshToken: null,
              tokenExpiresAt: null,
              user: null,
              organizationId: null,
              organization: null,
              orgLoadError: null,
              mfaSetupRequired: false,
              pendingMfaChallenge: null,
              rememberBrowser: true
            });
          }
          return ok;
        }
      },

      signOut: () => {
        void apiLogout().catch(() => undefined);
        set({
          token: null,
          refreshToken: null,
          tokenExpiresAt: null,
          user: null,
          organizationId: null,
          organization: null,
          orgLoadError: null,
          mfaSetupRequired: false,
          pendingMfaChallenge: null,
          rememberBrowser: true
        });
      },

      setUserProfile: (apiUser) => {
        const current = get().user;
        if (!current) return;
        set({ user: mapUser(apiUser, current.role) });
      },

      setOrganization: (organization) => {
        set({ organization, orgLoadError: null });
      }
    }),
    {
      name: 'nexus-auth',
      partialize: (state) => ({
        user: state.user,
        organizationId: state.organizationId,
        organization: state.organization,
        mfaSetupRequired: state.mfaSetupRequired
      }),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<AuthState>) ?? {};
        return {
          ...current,
          ...saved,
          token: saved.user ? 'cookie' : null,
          refreshToken: null,
          tokenExpiresAt: null,
          pendingMfaChallenge: null
        };
      }
    }
  )
);

export { displayNameFromEmail };

export function resolveDisplayName(user: AuthUser | null | undefined) {
  if (!user) return '';
  if (user.displayName?.trim()) return user.displayName.trim();
  return displayNameFromEmail(user.email);
}
