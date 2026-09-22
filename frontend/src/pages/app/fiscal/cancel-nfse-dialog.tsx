import { useState } from 'react';
import { BanIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export type NFSeCancelMotivo = '1' | '2' | '9';

interface CancelNFSeDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { c_motivo: NFSeCancelMotivo; justificativa: string }) => void;
}

const MOTIVO_OPTIONS: { value: NFSeCancelMotivo; label: string }[] = [
  { value: '1', label: '1 — Erro na emissão' },
  { value: '2', label: '2 — Serviço não prestado' },
  { value: '9', label: '9 — Outros' }
];

export function CancelNFSeDialog({ document, pending, onOpenChange, onConfirm }: CancelNFSeDialogProps) {
  const [cMotivo, setCMotivo] = useState<NFSeCancelMotivo>('1');
  const [justificativa, setJustificativa] = useState('');

  const open = !!document;
  const tooShort = justificativa.trim().length < 15;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setJustificativa('');
          setCMotivo('1');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={BanIcon}
          title="Cancelar NFS-e"
          description={
            document
              ? `${document.access_key || document.number || document.id} · evento SEFIN 101101`
              : 'Registro de cancelamento na NFS-e Nacional'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            O cancelamento é enviado à SEFIN Nacional. Não existe carta de correção para NFS-e — para
            corrigir dados, use a substituição (nova nota).
          </p>
          <div className="grid gap-2">
            <Label htmlFor="nfse-cancel-motivo">Motivo</Label>
            <Select value={cMotivo} onValueChange={(v) => setCMotivo(v as NFSeCancelMotivo)}>
              <SelectTrigger id="nfse-cancel-motivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nfse-cancel-just">Justificativa</Label>
            <Textarea
              id="nfse-cancel-just"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Descreva o motivo (mínimo 15 caracteres)"
              rows={4}
            />
            <p className="text-muted-foreground text-xs">
              {justificativa.trim().length}/15 caracteres mínimos
            </p>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || tooShort}
            onClick={() => onConfirm({ c_motivo: cMotivo, justificativa: justificativa.trim() })}
          >
            <BanIcon />
            {pending ? 'Enviando...' : 'Confirmar cancelamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
