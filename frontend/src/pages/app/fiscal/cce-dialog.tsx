import { useState } from 'react';
import { FilePenLineIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CCeDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { correcao: string; n_seq_evento: number }) => void;
}

export function CCeDialog({ document, pending, onOpenChange, onConfirm }: CCeDialogProps) {
  const [correcao, setCorrecao] = useState('');
  const [nSeq, setNSeq] = useState('1');
  const open = !!document;
  const tooShort = correcao.trim().length < 15;
  const seq = Number.parseInt(nSeq, 10);
  const invalidSeq = !Number.isFinite(seq) || seq < 1 || seq > 20;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCorrecao('');
          setNSeq('1');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={FilePenLineIcon}
          title="Carta de correção"
          description={
            document
              ? `${document.access_key || document.number || document.id} · evento SEFAZ 110110`
              : 'CC-e da NF-e na SEFAZ'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            A carta de correção não altera valores fiscais. Use apenas para correções textuais
            permitidas pela legislação.
          </p>
          <div className="grid gap-2">
            <Label htmlFor="nfe-cce-seq">Sequência do evento</Label>
            <Input
              id="nfe-cce-seq"
              type="number"
              min={1}
              max={20}
              value={nSeq}
              onChange={(e) => setNSeq(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nfe-cce-correcao">Correção (mín. 15 caracteres)</Label>
            <Textarea
              id="nfe-cce-correcao"
              value={correcao}
              onChange={(e) => setCorrecao(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Texto da correção…"
            />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Voltar
          </Button>
          <Button
            type="button"
            disabled={pending || tooShort || invalidSeq}
            onClick={() => onConfirm({ correcao: correcao.trim(), n_seq_evento: seq })}
          >
            {pending ? 'Enviando…' : 'Emitir CC-e'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
