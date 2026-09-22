import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { postLoginPath } from '@/lib/mfa-onboarding';
import { useAuthStore, type UserRole } from '@/store/auth-store';

function isPlatformStaff(role: string | undefined) {
  return role === 'admin' || role === 'system' || role === 'support';
}

export function RequireRole({ role }: { role: UserRole }) {
  const user = useAuthStore((s) => s.user);
  const organizationId = useAuthStore((s) => s.organizationId);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const location = useLocation();

  if (!user) {
    return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  }

  const setupPath = postLoginPath({
    result: mfaSetupRequired ? 'mfa_setup' : 'ok',
    role: user.role,
    mfaEnabled: user.mfaEnabled,
    userId: user.id,
    mfaSetupRequired
  });
  if (setupPath === '/mfa-setup' && location.pathname !== '/mfa-setup') {
    return <Navigate to="/mfa-setup" replace />;
  }

  if (role === 'admin') {
    if (user.role !== 'admin') {
      return <Navigate to="/app/overview" replace />;
    }
    return <Outlet />;
  }

  // /app: members always; platform staff only when a tenant org is selected.
  if (user.role === 'user') {
    return <Outlet />;
  }
  if (user.role === 'admin' && isPlatformStaff(user.platformRole) && organizationId) {
    return <Outlet />;
  }
  if (user.role === 'admin') {
    return <Navigate to="/admin/overview" replace />;
  }
  return <Navigate to="/login" replace />;
}
