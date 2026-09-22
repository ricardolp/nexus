import { useState } from 'react';
import { ReplaceIcon } from 'lucide-react';

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

export type NFSeSubstMotivo = '01' | '02' | '03' | '04' | '05' | '99';

interface SubstituteNFSeDialogProps {
  document: ApiFiscalDocument | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { motivo: NFSeSubstMotivo; justificativa: string }) => void;
}

const MOTIVO_OPTIONS: { value: NFSeSubstMotivo; label: string }[] = [
  { value: '01', label: '01 — Desenquadramento do Simples Nacional' },
  { value: '02', label: '02 — Enquadramento no Simples Nacional' },
  { value: '03', label: '03 — Inclusão retroativa de imunidade/isenção' },
  { value: '04', label: '04 — Exclusão retroativa de imunidade/isenção' },
  { value: '05', label: '05 — Rejeição pelo tomador/intermediário' },
  { value: '99', label: '99 — Outros (exige justificativa)' }
];

export function SubstituteNFSeDialog({ document, onOpenChange, onConfirm }: SubstituteNFSeDialogProps) {
  const [motivo, setMotivo] = useState<NFSeSubstMotivo>('99');
  const [justificativa, setJustificativa] = useState('');

  const open = !!document;
  const needsJust = motivo === '99';
  const tooShort = needsJust && justificativa.trim().length < 15;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setJustificativa('');
          setMotivo('99');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={ReplaceIcon}
          title="Substituir NFS-e"
          description={
            document
              ? `${document.access_key || document.number || document.id} · emissão de nota substituta`
              : 'Correção oficial via nova DPS com subst'
          }
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            A NFS-e Nacional não tem carta de correção. A correção é feita emitindo uma nova nota que
            referencia a original; a SEFIN cancela a anterior automaticamente (evento 105102).
          </p>
          <div className="grid gap-2">
            <Label htmlFor="nfse-subst-motivo">Motivo da substituição</Label>
            <Select value={motivo} onValueChange={(v) => setMotivo(v as NFSeSubstMotivo)}>
              <SelectTrigger id="nfse-subst-motivo">
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
            <Label htmlFor="nfse-subst-just">Justificativa{needsJust ? '' : ' (opcional)'}</Label>
            <Textarea
              id="nfse-subst-just"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder={
                needsJust
                  ? 'Descreva a correção (mínimo 15 caracteres)'
                  : 'Opcional — detalhe adicional da substituição'
              }
              rows={4}
            />
            {needsJust ? (
              <p className="text-muted-foreground text-xs">
                {justificativa.trim().length}/15 caracteres mínimos
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            type="button"
            disabled={tooShort}
            onClick={() =>
              onConfirm({
                motivo,
                justificativa: justificativa.trim()
              })
            }
          >
            <ReplaceIcon />
            Continuar para emitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
