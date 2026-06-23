import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { searchParamsCache } from '@/lib/searchparams';
import { organizationsQueryOptions } from '../api/queries';
import { OrganizationsTable } from './organizations-table';

export default function OrganizationListingPage() {
  const page = searchParamsCache.get('page');
  const search = searchParamsCache.get('name');
  const pageLimit = searchParamsCache.get('perPage');

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
  };

  const queryClient = getQueryClient();

  void queryClient.prefetchQuery(organizationsQueryOptions(filters));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrganizationsTable />
    </HydrationBoundary>
  );
}
