import { BanIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface AbortProcessingDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function AbortProcessingDialog({ document, pending, onOpenChange, onConfirm }: AbortProcessingDialogProps) {
  return (
    <Dialog open={!!document} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={BanIcon}
          title="Cancelar processamento"
          description={
            document
              ? document.number
                ? `${document.document_type === 'nfse' ? 'NFS-e' : 'NF-e'} ${document.number}`
                : document.access_key || document.document_key || document.id
              : 'A nota ainda não foi enviada.'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O processamento para antes do envio à SEFAZ ou à prefeitura. A nota fica como falha e pode ser
            reenviada depois. Notas que já foram transmitidas não podem ser interrompidas por aqui.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            <BanIcon />
            {pending ? 'Cancelando...' : 'Cancelar processamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
