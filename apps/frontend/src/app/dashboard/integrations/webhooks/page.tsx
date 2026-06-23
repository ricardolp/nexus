import { IntegrationPageShell } from '@/features/integration/components/integration-page-shell';
import WebhooksListing from '@/features/integration/components/webhooks-listing';
import { WebhookFormSheetTrigger } from '@/features/integration/components/webhook-form-sheet-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { WebhooksTableSkeleton } from '@/features/integration/components/webhooks-table';

export const metadata = {
  title: 'Integrações: Webhooks',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function IntegrationWebhooksPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <IntegrationPageShell
      pageTitle='Webhooks'
      pageDescription='Configure endpoints para receber eventos de documentos fiscais e integrações SAP em tempo real.'
      pageHeaderAction={<WebhookFormSheetTrigger />}
    >
      <Suspense fallback={<WebhooksTableSkeleton />}>
        <WebhooksListing />
      </Suspense>
    </IntegrationPageShell>
  );
}
