import { ArrowUpFromLineIcon } from 'lucide-react';

import { FiscalDocumentsPage } from './fiscal-documents-page';

export default function NFeSaidaPage() {
  return (
    <FiscalDocumentsPage
      documentType="nfe"
      direction="outbound"
      icon={ArrowUpFromLineIcon}
      title="NF-e Saída"
      description="Emissão e acompanhamento de notas fiscais de saída enviadas à SEFAZ."
    />
  );
}
