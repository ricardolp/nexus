import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';
import {
  NfeEventDetailSkeleton,
  NfeEventDetailView,
} from '@/features/nfe-documents/components/nfe-event-detail-view';
import { Suspense } from 'react';

export const metadata = {
  title: 'Documentos: Detalhe do Evento',
};

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function NfeEventDetailPage(props: PageProps) {
  const { eventId } = await props.params;

  return (
    <DocumentsPageShell
      pageTitle='Detalhe do Evento'
      pageDescription='Visualização completa do evento vinculado à NF-e.'
    >
      <Suspense fallback={<NfeEventDetailSkeleton />}>
        <NfeEventDetailView eventId={eventId} />
      </Suspense>
    </DocumentsPageShell>
  );
}
