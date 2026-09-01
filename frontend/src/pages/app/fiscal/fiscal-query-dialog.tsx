import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { createFiscalDocumentQuery, listCompanies } from '@/lib/endpoints';
import type { FiscalQueryType } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CHAVE_LENGTH = 44;

function parseChaves(raw: string): { valid: string[]; invalidCount: number } {
  const candidates = raw
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const valid = new Set<string>();
  let invalidCount = 0;
  for (const c of candidates) {
    if (/^\d{44}$/.test(c)) {
      valid.add(c);
    } else {
      invalidCount += 1;
    }
  }
  return { valid: Array.from(valid), invalidCount };
}

interface FiscalQueryDialogProps {
  type: FiscalQueryType;
  icon: LucideIcon;
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: () => void;
}

export function FiscalQueryDialog({
  type,
  icon,
  title,
  description,
  open,
  onOpenChange,
  onStarted
}: FiscalQueryDialogProps) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();

  const [companyId, setCompanyId] = useState('');
  const [chave, setChave] = useState('');
  const [nsu, setNsu] = useState('');
  const [batchText, setBatchText] = useState('');

  const companiesQuery = useQuery({
    queryKey: ['companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId!),
    enabled: open && !!token && !!organizationId
  });
  const companies = companiesQuery.data?.items ?? [];

  const batchParsed = useMemo(() => parseChaves(batchText), [batchText]);

  function resetForm() {
    setCompanyId('');
    setChave('');
    setNsu('');
    setBatchText('');
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (type === 'chave') {
        return createFiscalDocumentQuery(token!, organizationId!, companyId, { type, chaves: [chave.trim()] });
      }
      if (type === 'nsu') {
        return createFiscalDocumentQuery(token!, organizationId!, companyId, { type, nsu: Number(nsu) });
      }
      return createFiscalDocumentQuery(token!, organizationId!, companyId, { type, chaves: batchParsed.valid });
    },
    onSuccess: (req) => {
      toast.success(req.already_queued ? 'Consulta já está na fila' : 'Consulta na fila', {
        description: req.already_queued
          ? 'Não foi criada uma nova consulta. Acompanhe a existente na aba Consultas SEFAZ.'
          : 'Acompanhe o status na aba Consultas SEFAZ desta tela.'
      });
      resetForm();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['fiscal-document-queries', organizationId] });
      onStarted?.();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível iniciar a consulta.');
    }
  });

  const canSubmit =
    !!companyId &&
    (type === 'chave'
      ? /^\d{44}$/.test(chave.trim())
      : type === 'nsu'
        ? nsu.trim() !== '' && Number(nsu) >= 0
        : batchParsed.valid.length > 0 && batchParsed.valid.length <= 100);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetForm();
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <GradientDialogHeader icon={icon} title={title} description={description} />

        <div className="flex flex-col gap-4 px-6 py-4">
          <div className="flex flex-col gap-2">
            <Label>Empresa</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === 'chave' && (
            <div className="flex flex-col gap-2">
              <Label>Chave de acesso</Label>
              <Input
                placeholder="44 dígitos"
                value={chave}
                onChange={(e) => setChave(e.target.value.replace(/\D/g, ''))}
                maxLength={CHAVE_LENGTH}
              />
              <p className="text-muted-foreground text-xs">
                {chave.length}/{CHAVE_LENGTH} dígitos
              </p>
            </div>
          )}

          {type === 'nsu' && (
            <div className="flex flex-col gap-2">
              <Label>NSU inicial</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={nsu}
                onChange={(e) => setNsu(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                A consulta busca, a partir deste NSU, todos os documentos disponíveis no SEFAZ.
              </p>
            </div>
          )}

          {type === 'batch' && (
            <div className="flex flex-col gap-2">
              <Label>Chaves de acesso</Label>
              <Textarea
                placeholder="Cole uma ou várias chaves de 44 dígitos, separadas por linha, vírgula ou espaço"
                rows={6}
                value={batchText}
                onChange={(e) => setBatchText(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                {batchParsed.valid.length} chave(s) válida(s)
                {batchParsed.invalidCount > 0 ? `, ${batchParsed.invalidCount} inválida(s)` : ''}
                {batchParsed.valid.length > 100 ? ' — limite de 100 por envio' : ''}
              </p>
            </div>
          )}

          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
            O SEFAZ limita 20 consultas por hora por empresa — esse orçamento é compartilhado com a
            distribuição automática, então lotes grandes podem levar horas para concluir. Notas emitidas há
            mais de ~90 dias podem não ser localizadas e precisam ser importadas manualmente.
          </p>
        </div>

        <DialogFooter className="px-6 pb-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Iniciando...' : 'Iniciar consulta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
