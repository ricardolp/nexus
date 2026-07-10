'use client';

import { useAuth } from '@/context/auth-context';
import { Suspense } from 'react';
import {
  NfeEventsTable,
  NfeEventsTableSkeleton,
} from './nfe-events-table';

export function NfeEventsListing() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <NfeEventsTableSkeleton />;
  }

  return (
    <div className='flex min-h-[28rem] flex-1 flex-col'>
      <Suspense fallback={<NfeEventsTableSkeleton />}>
        <NfeEventsTable organizationId={activeOrganizationId} />
      </Suspense>
    </div>
  );
}
