'use client';

import { useAuth } from '@/context/auth-context';
import { IntegrationTokensTable, IntegrationTokensTableSkeleton } from './integration-tokens-table';

export default function IntegrationTokensListing() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <IntegrationTokensTableSkeleton />;
  }

  return <IntegrationTokensTable organizationId={activeOrganizationId} />;
}
