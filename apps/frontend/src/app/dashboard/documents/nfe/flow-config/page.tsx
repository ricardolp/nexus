import { DocumentsPageShell } from '@/features/documents/components/documents-page-shell';
import { NfeFlowConfigPage } from '@/features/nfe-flow-config/components/nfe-flow-config-page';

export const metadata = {
  title: 'Documentos: Configuração de Fluxo NFe',
};

export default function NfeFlowConfigRoutePage() {
  return (
    <DocumentsPageShell
      pageTitle='Configuração do Fluxo da Nota Fiscal'
      pageDescription='Configure visualmente o processo da NF por modelo e empresa.'
    >
      <NfeFlowConfigPage />
    </DocumentsPageShell>
  );
}
