import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';
import { NfeEventsListing } from '@/features/nfe-documents/components/nfe-events-listing';
import { NfeEventsTableSkeleton } from '@/features/nfe-documents/components/nfe-events-table';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';

export const metadata = {
  title: 'Documentos: Eventos de Notas Fiscais',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function NfeEventsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <DocumentsPageShell
      pageTitle='Eventos de Notas Fiscais'
      pageDescription='Eventos vinculados às notas fiscais eletrônicas da organização selecionada.'
    >
      <Suspense fallback={<NfeEventsTableSkeleton />}>
        <NfeEventsListing />
      </Suspense>
    </DocumentsPageShell>
  );
}
