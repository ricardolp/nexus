import { useState } from 'react';
import { HashIcon } from 'lucide-react';

import type { ApiFiscalDocument } from '@/lib/api-types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface InutilizationDialogProps {
  document: ApiFiscalDocument | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    organization_company_id: string;
    serie: string;
    numero_inicial: number;
    numero_final: number;
    ano: number;
    justificativa: string;
    document_id?: string;
  }) => void;
}

export function InutilizationDialog({
  document,
  pending,
  onOpenChange,
  onConfirm
}: InutilizationDialogProps) {
  const [serie, setSerie] = useState(document?.series ?? '1');
  const [numeroInicial, setNumeroInicial] = useState(document?.number ?? '');
  const [numeroFinal, setNumeroFinal] = useState(document?.number ?? '');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [justificativa, setJustificativa] = useState('');
  const open = !!document;

  const nIni = Number.parseInt(numeroInicial, 10);
  const nFim = Number.parseInt(numeroFinal, 10);
  const year = Number.parseInt(ano, 10);
  const tooShort = justificativa.trim().length < 15;
  const invalidRange = !Number.isFinite(nIni) || !Number.isFinite(nFim) || nIni <= 0 || nFim < nIni;
  const invalidYear = !Number.isFinite(year) || year < 2000 || year > 2100;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setJustificativa('');
        } else if (document) {
          setSerie(document.series ?? '1');
          setNumeroInicial(document.number ?? '');
          setNumeroFinal(document.number ?? '');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader
          icon={HashIcon}
          title="Inutilizar numeração"
          description="Inutilização de faixa de numeração NF-e na SEFAZ"
        />

        <div className="flex flex-col gap-4 px-6 py-4">
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
            Informe a série e a faixa. O pedido é enviado à SEFAZ pela empresa emitente desta nota.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="nfe-inut-serie">Série</Label>
              <Input id="nfe-inut-serie" value={serie} onChange={(e) => setSerie(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nfe-inut-ano">Ano</Label>
              <Input id="nfe-inut-ano" type="number" value={ano} onChange={(e) => setAno(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nfe-inut-ini">Número inicial</Label>
              <Input
                id="nfe-inut-ini"
                type="number"
                value={numeroInicial}
                onChange={(e) => setNumeroInicial(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nfe-inut-fim">Número final</Label>
              <Input
                id="nfe-inut-fim"
                type="number"
                value={numeroFinal}
                onChange={(e) => setNumeroFinal(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nfe-inut-just">Justificativa (mín. 15 caracteres)</Label>
            <Textarea
              id="nfe-inut-just"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              maxLength={255}
            />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Voltar
          </Button>
          <Button
            type="button"
            disabled={pending || tooShort || invalidRange || invalidYear || !document}
            onClick={() => {
              if (!document) return;
              onConfirm({
                organization_company_id: document.organization_company_id,
                serie: serie.trim(),
                numero_inicial: nIni,
                numero_final: nFim,
                ano: year,
                justificativa: justificativa.trim(),
                document_id: document.id
              });
            }}
          >
            {pending ? 'Enviando…' : 'Inutilizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
