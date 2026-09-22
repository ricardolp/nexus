import { Navigate, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import type { ContractServiceCode } from '@/lib/api-types';
import { listOrganizationServices } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

export function useOrganizationServices() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  return useQuery({
    queryKey: ['organization-services', organizationId],
    queryFn: () => listOrganizationServices(token!, organizationId!),
    enabled: !!token && !!organizationId,
    staleTime: 60_000
  });
}

export function useActiveContractServices(): Set<string> | null {
  const query = useOrganizationServices();
  if (!query.data) return null;
  return new Set(
    query.data.items.filter((s) => s.status === 'active').map((s) => s.service_code)
  );
}

/** Blocks fiscal routes when the org contract does not include the module. */
export function RequireOrgService({ service }: { service: ContractServiceCode }) {
  const active = useActiveContractServices();
  const query = useOrganizationServices();

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError || active === null || !active.has(service)) {
    return <Navigate to="/app/overview" replace />;
  }

  return <Outlet />;
}
