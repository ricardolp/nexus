import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';
import { NfeDocumentsListing } from '@/features/nfe-documents/components/nfe-documents-listing';
import { NfeDocumentsImportTrigger } from '@/features/nfe-documents/components/nfe-documents-import-trigger';
import { searchParamsCache } from '@/lib/searchparams';
import type { SearchParams } from 'nuqs/server';
import { Suspense } from 'react';
import { NfeDocumentsTableSkeleton } from '@/features/nfe-documents/components/nfe-documents-table';

export const metadata = {
  title: 'Documentos: Notas Fiscais',
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function NfeDocumentsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <DocumentsPageShell
      pageTitle='Notas Fiscais'
      pageDescription='Notas fiscais eletrônicas da organização selecionada.'
      pageHeaderAction={
        <Suspense fallback={null}>
          <NfeDocumentsImportTrigger />
        </Suspense>
      }
    >
      <Suspense fallback={<NfeDocumentsTableSkeleton />}>
        <NfeDocumentsListing />
      </Suspense>
    </DocumentsPageShell>
  );
}
