'use client';

import { useAuth } from '@/context/auth-context';
import { MembersTable, MembersTableSkeleton } from './members-table';

export default function MemberListingPage() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <MembersTableSkeleton />;
  }

  return <MembersTable organizationId={activeOrganizationId} />;
}
