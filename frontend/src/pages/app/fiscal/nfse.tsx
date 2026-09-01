import { ReceiptTextIcon } from 'lucide-react';

import { FiscalDocumentsPage } from './fiscal-documents-page';

export default function NFSePage() {
  return (
    <FiscalDocumentsPage
      documentType="nfse"
      icon={ReceiptTextIcon}
      title="Notas Fiscais Serviço (NFSE)"
      description="Notas fiscais de serviço eletrônicas (NFS-e) recebidas pela organização."
    />
  );
}
