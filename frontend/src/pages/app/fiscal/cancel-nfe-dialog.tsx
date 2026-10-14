import { useState } from 'react';
import { BanIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CancelNFeDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { justificativa: string }) => void;
}

export function CancelNFeDialog({ document, pending, onOpenChange, onConfirm }: CancelNFeDialogProps) {
  const [justificativa, setJustificativa] = useState('');
  const open = !!document;
  const tooShort = justificativa.trim().length < 15;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setJustificativa('');
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={BanIcon}
          title="Cancelar NF-e"
          description={
            document
              ? `${document.access_key || document.number || document.id} · evento SEFAZ 110111`
              : 'Cancelamento da NF-e na SEFAZ'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O cancelamento é enviado à SEFAZ com o protocolo de autorização. Após aceite, o XML do
            evento fica disponível para download.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="nfe-cancel-justificativa">Justificativa (mín. 15 caracteres)</Label>
            <Textarea
              id="nfe-cancel-justificativa"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={4}
              maxLength={255}
              placeholder="Descreva o motivo do cancelamento…"
            />
            <p className="text-muted-foreground text-xs">{justificativa.trim().length}/255</p>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || tooShort}
            onClick={() => onConfirm({ justificativa: justificativa.trim() })}
          >
            {pending ? 'Enviando…' : 'Cancelar NF-e'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
