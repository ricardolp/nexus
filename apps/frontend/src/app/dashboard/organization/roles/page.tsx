import { OrganizationPageShell } from '@/features/organization/components/organization-page-shell';
import RoleListingPage from '@/features/organization/components/role-listing';
import { RoleFormSheetTrigger } from '@/features/organization/components/role-form-sheet-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { RolesTableSkeleton } from '@/features/organization/components/roles-table';

export const metadata = {
  title: 'Organização: Perfis',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationRolesPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <OrganizationPageShell
      pageTitle='Perfis'
      pageDescription='Perfis de acesso configurados na organização selecionada.'
      pageHeaderAction={<RoleFormSheetTrigger />}
    >
      <Suspense fallback={<RolesTableSkeleton />}>
        <RoleListingPage />
      </Suspense>
    </OrganizationPageShell>
  );
}
