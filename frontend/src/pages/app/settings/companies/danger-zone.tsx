import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import { updateCompanyStatus } from '@/lib/endpoints';
import type { ApiCompany } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { formatCNPJ } from './columns';

export function CompanyDangerZone({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canToggle = company.status === 'active' || company.status === 'disabled';
  const isDisabled = company.status === 'disabled';

  const statusMutation = useMutation({
    mutationFn: (status: 'active' | 'disabled') =>
      updateCompanyStatus(token!, organizationId!, company.id, status),
    onSuccess: (updated) => {
      toast.success(updated.status === 'active' ? 'Empresa ativada' : 'Empresa desativada', {
        description: updated.legal_name
      });
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['companies', organizationId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-destructive text-lg font-semibold">Zona de perigo</h3>
        <p className="text-muted-foreground text-sm">
          Ações destrutivas nesta empresa. Prossiga com extrema cautela.
        </p>
      </div>

      <div className="border-destructive/40 divide-y overflow-hidden rounded-xl border">
        {isDisabled ? (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Reativar empresa</p>
              <p className="text-muted-foreground text-sm">
                Volta a permitir login fiscal, distribuição e emissão para {formatCNPJ(company.cnpj)}. Os
                serviços e o certificado permanecem como estavam.
              </p>
            </div>
            <Button
              type="button"
              className="shrink-0"
              disabled={!canToggle || statusMutation.isPending}
              onClick={() => statusMutation.mutate('active')}
            >
              {statusMutation.isPending ? 'Ativando...' : 'Reativar'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Desativar empresa</p>
              <p className="text-muted-foreground text-sm">
                Impede emissão, consulta e distribuição para este CNPJ. Dados, certificado e fluxos são
                preservados e podem ser reativados depois.
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              className="shrink-0"
              disabled={!canToggle || statusMutation.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Desativar
            </Button>
          </div>
        )}

        {!canToggle && (
          <div className="p-4">
            <p className="text-muted-foreground text-sm">
              Esta empresa está suspensa. O status só pode ser alterado pelo suporte da plataforma.
            </p>
          </div>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        A desativação não apaga documentos nem o certificado digital. Se precisar recuperar um estado
        anterior, fale com o suporte.
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar {company.legal_name}?</DialogTitle>
            <DialogDescription>
              A empresa {formatCNPJ(company.cnpj)} deixa de emitir e consultar documentos na SEFAZ até ser
              reativada. Os dados cadastrais são preservados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate('disabled')}
            >
              {statusMutation.isPending ? 'Desativando...' : 'Desativar empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
