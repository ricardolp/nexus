'use client';

import { useAuth } from '@/context/auth-context';
import { CompaniesTable, CompaniesTableSkeleton } from './companies-table';

export default function CompanyListingPage() {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <CompaniesTableSkeleton />;
  }

  return <CompaniesTable organizationId={activeOrganizationId} />;
}
