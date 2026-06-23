import { OrganizationPageShell } from '@/features/organization/components/organization-page-shell';
import CompanyListingPage from '@/features/organization/components/company-listing';
import { CompanyFormSheetTrigger } from '@/features/organization/components/company-form-sheet-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { CompaniesTableSkeleton } from '@/features/organization/components/companies-table';

export const metadata = {
  title: 'Organização: Empresas',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationCompaniesPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <OrganizationPageShell
      pageTitle='Empresas'
      pageDescription='Empresas cadastradas na organização selecionada.'
      pageHeaderAction={<CompanyFormSheetTrigger />}
    >
      <Suspense fallback={<CompaniesTableSkeleton />}>
        <CompanyListingPage />
      </Suspense>
    </OrganizationPageShell>
  );
}
