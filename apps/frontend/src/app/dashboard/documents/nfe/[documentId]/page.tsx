import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';
import { NfeDocumentDetailView } from '@/features/nfe-documents/components/nfe-document-detail/detail-view';
import { DetailSkeleton } from '@/features/nfe-documents/components/nfe-document-detail/detail-skeleton';
import { Suspense } from 'react';

export const metadata = {
  title: 'Detalhe da Nota Fiscal',
};

type PageProps = {
  params: Promise<{ documentId: string }>;
};

export default async function NfeDocumentDetailPage(props: PageProps) {
  const { documentId } = await props.params;

  return (
    <DocumentsPageShell
      pageTitle='Detalhe da NF-e'
      pageDescription='Visualização completa do documento e fluxo de processamento.'
    >
      <Suspense fallback={<DetailSkeleton />}>
        <NfeDocumentDetailView documentId={documentId} />
      </Suspense>
    </DocumentsPageShell>
  );
}
