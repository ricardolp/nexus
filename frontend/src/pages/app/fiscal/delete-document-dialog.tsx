import { Trash2Icon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface DeleteDocumentDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteDocumentDialog({ document, pending, onOpenChange, onConfirm }: DeleteDocumentDialogProps) {
  return (
    <Dialog open={!!document} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={Trash2Icon}
          title="Excluir documento"
          description={
            document
              ? `${document.access_key || document.document_key || document.id} · importado manualmente`
              : 'Esta ação não pode ser desfeita.'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O documento, seus itens, correspondências e o XML armazenado serão removidos permanentemente. Essa
            ação não pode ser desfeita — mas o mesmo XML pode ser importado novamente depois.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            <Trash2Icon />
            {pending ? 'Excluindo...' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
