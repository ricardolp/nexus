'use client';

import { useAuth } from '@/context/auth-context';
import { WebhooksTable, WebhooksTableSkeleton } from './webhooks-table';

export default function WebhooksListing() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <WebhooksTableSkeleton />;
  }

  return <WebhooksTable organizationId={activeOrganizationId} />;
}
