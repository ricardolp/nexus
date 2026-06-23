import PageContainer from '@/components/layout/page-container';
import OrganizationListingPage from '@/features/admin-organizations/components/organization-listing';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';

export const metadata = {
  title: 'Admin: Organizações',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminOrganizationsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle='Organizações'
      pageDescription='Crie organizações e gerencie usuários vinculados a cada uma.'
    >
      <OrganizationListingPage />
    </PageContainer>
  );
}
