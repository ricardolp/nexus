import { ArrowUpFromLineIcon, PlusIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { FiscalDocumentsPage } from './fiscal-documents-page';

export default function NFSeSaidaPage() {
  const navigate = useNavigate();

  return (
    <FiscalDocumentsPage
      documentType="nfse"
      direction="outbound"
      icon={ArrowUpFromLineIcon}
      title="NFS-e Saída"
      description="Emissão e acompanhamento de notas de serviço enviadas ao Portal Nacional (SEFIN)."
      toolbarExtra={
        <Button className="sm:ml-auto" onClick={() => navigate('/app/nfse/saida/nova')}>
          <PlusIcon />
          Emitir NFS-e
        </Button>
      }
    />
  );
}
