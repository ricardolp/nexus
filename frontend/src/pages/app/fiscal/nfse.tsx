import { ReceiptTextIcon } from 'lucide-react';

import { FiscalDocumentsPage } from './fiscal-documents-page';

export default function NFSePage() {
  return (
    <FiscalDocumentsPage
      documentType="nfse"
      direction="inbound"
      icon={ReceiptTextIcon}
      title="NFS-e Entrada"
      description="Notas fiscais de serviço eletrônicas (NFS-e) recebidas pela organização."
    />
  );
}
