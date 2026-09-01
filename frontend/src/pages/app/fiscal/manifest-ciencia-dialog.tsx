import { BadgeCheckIcon } from 'lucide-react';

import type { ApiPendingFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';

interface ManifestCienciaDialogProps {
  document: ApiPendingFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ManifestCienciaDialog({ document, pending, onOpenChange, onConfirm }: ManifestCienciaDialogProps) {
  return (
    <Dialog open={!!document} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={BadgeCheckIcon}
          title="Dar Ciência da Operação"
          description={document ? document.chave : undefined}
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            A Ciência da Operação apenas reconhece que esta nota existe contra o CNPJ da empresa — ela{' '}
            <strong>não</strong> confirma nem concorda com o conteúdo. É o passo que libera o XML completo na
            SEFAZ; a decisão real (confirmar, desconhecer ou marcar como operação não realizada) só será tomada
            depois, com o documento completo em mãos.
          </p>
          {document?.nome_emitente && (
            <p className="text-sm">
              Emitente: <span className="font-medium">{document.nome_emitente}</span>
            </p>
          )}
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            <BadgeCheckIcon />
            {pending ? 'Enviando...' : 'Dar Ciência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
