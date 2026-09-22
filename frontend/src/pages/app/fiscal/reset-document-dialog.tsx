import { RotateCcwIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface ResetDocumentDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ResetDocumentDialog({ document, pending, onOpenChange, onConfirm }: ResetDocumentDialogProps) {
  return (
    <Dialog open={!!document} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={RotateCcwIcon}
          title="Resetar nota"
          description={
            document
              ? `${document.access_key || document.document_key || document.number || document.id}`
              : 'A nota volta ao estado de importada.'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O status volta para o original (apenas importado). Matching e plano de execução são refeitos para
            recomeçar a partir do pedido. Só é permitido quando nenhum documento SAP (pedido, MIGO ou MIRO) foi
            gerado.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            <RotateCcwIcon />
            {pending ? 'Resetando...' : 'Resetar nota'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
