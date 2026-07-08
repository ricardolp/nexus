import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { searchParamsCache } from '@/lib/searchparams';
import { organizationsQueryOptions } from '../api/queries';
import { getOrganizations } from '../api/service.server';
import { OrganizationsTable } from './organizations-table';

export default async function OrganizationListingPage() {
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
  };

  const queryClient = getQueryClient();

  await queryClient.prefetchQuery({
    ...organizationsQueryOptions(filters),
    queryFn: () => getOrganizations(filters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrganizationsTable />
    </HydrationBoundary>
  );
}
