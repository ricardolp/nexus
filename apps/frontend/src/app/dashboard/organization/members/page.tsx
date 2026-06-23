import { OrganizationPageShell } from '@/features/organization/components/organization-page-shell';
import MemberListingPage from '@/features/organization/components/member-listing';
import { MemberUserFormSheetTrigger } from '@/features/organization/components/member-user-form-sheet-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { MembersTableSkeleton } from '@/features/organization/components/members-table';

export const metadata = {
  title: 'Organização: Usuários',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationMembersPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <OrganizationPageShell
      pageTitle='Usuários'
      pageDescription='Membros vinculados à organização selecionada.'
      pageHeaderAction={<MemberUserFormSheetTrigger />}
    >
      <Suspense fallback={<MembersTableSkeleton />}>
        <MemberListingPage />
      </Suspense>
    </OrganizationPageShell>
  );
}
