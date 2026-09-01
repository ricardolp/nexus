import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { postLoginPath } from '@/lib/mfa-onboarding';
import { useAuthStore, type UserRole } from '@/store/auth-store';

export function RequireRole({ role }: { role: UserRole }) {
  const user = useAuthStore((s) => s.user);
  const mfaSetupRequired = useAuthStore((s) => s.mfaSetupRequired);
  const location = useLocation();

  if (!user) {
    return <Navigate to={role === 'admin' ? '/admin/login' : '/login'} replace />;
  }

  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/overview' : '/app/overview'} replace />;
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

  return <Outlet />;
}
