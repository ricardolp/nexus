'use client';

import { useAuth } from '@/context/auth-context';
import { Suspense } from 'react';
import {
  KpiSummaryCards,
  KpiSummaryCardsSkeleton,
} from './kpi-summary-cards';
import {
  NfeDocumentsTable,
  NfeDocumentsTableSkeleton,
} from './nfe-documents-table';

export function NfeDocumentsListing() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return (
      <div className='flex flex-col gap-6'>
        <KpiSummaryCardsSkeleton />
        <NfeDocumentsTableSkeleton />
      </div>
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-6'>
      <Suspense fallback={<KpiSummaryCardsSkeleton />}>
        <KpiSummaryCards organizationId={activeOrganizationId} />
      </Suspense>
      <div className='flex min-h-[28rem] flex-1 flex-col'>
        <Suspense fallback={<NfeDocumentsTableSkeleton />}>
          <NfeDocumentsTable organizationId={activeOrganizationId} />
        </Suspense>
      </div>
    </div>
  );
}
