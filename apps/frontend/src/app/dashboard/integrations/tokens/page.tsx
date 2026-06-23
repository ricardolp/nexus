import { IntegrationPageShell } from '@/features/integration/components/integration-page-shell';
import IntegrationTokensListing from '@/features/integration/components/integration-tokens-listing';
import { TokenFormSheetTrigger } from '@/features/integration/components/token-form-sheet-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { IntegrationTokensTableSkeleton } from '@/features/integration/components/integration-tokens-table';

export const metadata = {
  title: 'Integrações: Tokens de API',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function IntegrationTokensPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <IntegrationPageShell
      pageTitle='Tokens de integração'
      pageDescription='Gerencie tokens de API para sistemas externos consumirem os endpoints de integração.'
      pageHeaderAction={<TokenFormSheetTrigger />}
    >
      <Suspense fallback={<IntegrationTokensTableSkeleton />}>
        <IntegrationTokensListing />
      </Suspense>
    </IntegrationPageShell>
  );
}
