'use client';

import { useAuth } from '@/context/auth-context';
import { RolesTable, RolesTableSkeleton } from './roles-table';

export default function RoleListingPage() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <RolesTableSkeleton />;
  }

  return <RolesTable organizationId={activeOrganizationId} />;
}
