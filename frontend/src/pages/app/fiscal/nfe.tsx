import { ArrowDownToLineIcon } from 'lucide-react';

import { FiscalDocumentsPage } from './fiscal-documents-page';

export default function NFePage() {
  return (
    <FiscalDocumentsPage
      documentType="nfe"
      direction="inbound"
      icon={ArrowDownToLineIcon}
      title="NF-e Entrada"
      description="Documentos fiscais eletrônicos (NF-e) recebidos pela organização."
    />
  );
}
