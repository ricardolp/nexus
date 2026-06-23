import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';

export const metadata = {
  title: 'Documentos: Eventos de Notas Fiscais',
};

export default function NfeEventsPage() {
  return (
    <DocumentsPageShell
      pageTitle='Eventos de Notas Fiscais'
      pageDescription='Eventos vinculados às notas fiscais eletrônicas da organização selecionada.'
    >
      <div className='text-muted-foreground flex min-h-[300px] items-center justify-center rounded-lg border border-dashed text-sm'>
        Listagem de eventos de notas fiscais em breve.
      </div>
    </DocumentsPageShell>
  );
}
