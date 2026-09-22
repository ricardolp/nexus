import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import type { ApiCompany, ApiCompanyNFSeService } from '@/lib/api-types';
import {
  createCompanyNFSeService,
  deleteCompanyNFSeService,
  listCompanyCNAEs,
  listCompanyNFSeServices,
  syncCompanyCNAEs,
  updateCompanyCNAE,
  updateCompanyNFSeService,
  type ApiCompanyCNAE,
  type UpsertCompanyNFSeServiceInput
} from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const emptyForm: UpsertCompanyNFSeServiceInput = {
  cnae_code: '',
  cnae_description: '',
  service_description: '',
  status: 'active'
};

function formatCnaeCode(code: string) {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 7) return code;
  return `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}`;
}

function truncateText(value: string, max = 72) {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function CompanyNFSeActivitiesTab({ company }: { company: ApiCompany }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ApiCompanyNFSeService | null>(null);
  const [form, setForm] = useState<UpsertCompanyNFSeServiceInput>(emptyForm);

  const query = useQuery({
    queryKey: ['company-nfse-services', organizationId, company.id],
    queryFn: () => listCompanyNFSeServices(token!, organizationId!, company.id),
    enabled: !!token && !!organizationId
  });

  const cnaesQuery = useQuery({
    queryKey: ['company-cnaes', organizationId, company.id],
    queryFn: () => listCompanyCNAEs(token!, organizationId!, company.id),
    enabled: !!token && !!organizationId
  });
  const companyCnaes = cnaesQuery.data?.items ?? [];

  const syncMutation = useMutation({
    mutationFn: () => syncCompanyCNAEs(token!, organizationId!, company.id),
    onSuccess: (data) => {
      toast.success(`${data.items.length} CNAE(s) sincronizado(s) da Receita`);
      void queryClient.invalidateQueries({ queryKey: ['company-cnaes', organizationId, company.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Falha ao sincronizar CNAEs')
  });

  const cnaeKey = ['company-cnaes', organizationId, company.id] as const;
  const toggleCnaeMutation = useMutation({
    mutationFn: ({ cnae, enabled }: { cnae: ApiCompanyCNAE; enabled: boolean }) =>
      updateCompanyCNAE(token!, organizationId!, company.id, cnae.id, { enabled }),
    onMutate: async ({ cnae, enabled }) => {
      await queryClient.cancelQueries({ queryKey: cnaeKey });
      const previous = queryClient.getQueryData<{ items: ApiCompanyCNAE[] }>(cnaeKey);
      queryClient.setQueryData<{ items: ApiCompanyCNAE[] }>(cnaeKey, (old) => ({
        items: (old?.items ?? []).map((item) => (item.id === cnae.id ? { ...item, enabled } : item))
      }));
      return { previous };
    },
    onSuccess: (item) => {
      toast.success(item.enabled ? 'CNAE visível na emissão' : 'CNAE oculto na emissão', {
        description: formatCnaeCode(item.cnae_code)
      });
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(cnaeKey, context.previous);
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o CNAE');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: cnaeKey });
    }
  });

  function openCreate() {
    setEditing(null);
    const primary = companyCnaes.find((c) => c.is_primary) ?? companyCnaes[0];
    setForm({
      ...emptyForm,
      cnae_code: primary?.cnae_code ?? '',
      cnae_description: primary?.cnae_description ?? ''
    });
    setOpen(true);
  }

  function openEdit(item: ApiCompanyNFSeService) {
    setEditing(item);
    setForm({
      cnae_code: item.cnae_code,
      cnae_description: item.cnae_description ?? '',
      service_description: item.service_description ?? '',
      status: item.status
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: UpsertCompanyNFSeServiceInput = {
        cnae_code: form.cnae_code,
        cnae_description: form.cnae_description,
        service_description: form.service_description?.trim() || '',
        status: form.status || 'active'
      };
      if (editing) {
        return updateCompanyNFSeService(token!, organizationId!, company.id, editing.id, payload);
      }
      return createCompanyNFSeService(token!, organizationId!, company.id, payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Atividade atualizada' : 'Atividade adicionada');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['company-nfse-services', organizationId, company.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar')
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCompanyNFSeService(token!, organizationId!, company.id, id),
    onSuccess: () => {
      toast.success('Atividade removida');
      void queryClient.invalidateQueries({ queryKey: ['company-nfse-services', organizationId, company.id] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover')
  });

  const items = query.data?.items ?? [];
  const sortedCnaes = useMemo(
    () =>
      [...companyCnaes].sort((a, b) => {
        const aOn = a.enabled !== false;
        const bOn = b.enabled !== false;
        if (aOn !== bOn) return aOn ? -1 : 1;
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return a.cnae_code.localeCompare(b.cnae_code);
      }),
    [companyCnaes]
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>Atividades NFS-e</CardTitle>
          <CardDescription>
            Cadastre as atividades da empresa com CNAE e descrição. Desative CNAEs que não devem
            aparecer na emissão da NFS-e. NBS e item da lista de serviço são escolhidos na nota.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCwIcon />
            {syncMutation.isPending ? 'Sincronizando…' : 'Sincronizar CNAEs'}
          </Button>
          <Button onClick={openCreate} disabled={companyCnaes.length === 0}>
            <PlusIcon />
            Nova atividade
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">CNAEs da empresa</p>
            {companyCnaes.length > 0 ? (
              <p className="text-muted-foreground text-xs">
                {companyCnaes.filter((c) => c.enabled !== false).length} de {companyCnaes.length} visível(is)
                na emissão
              </p>
            ) : null}
          </div>
          {cnaesQuery.isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando CNAEs…</p>
          ) : cnaesQuery.isError ? (
            <p className="text-destructive text-sm">
              {cnaesQuery.error instanceof ApiError
                ? cnaesQuery.error.message
                : 'Não foi possível carregar os CNAEs.'}
            </p>
          ) : companyCnaes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum CNAE cadastrado. Clique em <strong>Sincronizar CNAEs</strong> para buscar na Receita Federal.
            </p>
          ) : (
            <ul className="divide-border max-h-80 overflow-y-auto rounded-lg border">
              {sortedCnaes.map((c) => {
                const enabled = c.enabled !== false;
                return (
                  <li
                    key={c.id}
                    className={cn(
                      'flex items-start gap-3 px-3 py-2.5',
                      !enabled && 'bg-muted/30 opacity-70'
                    )}
                  >
                    <code className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-xs">
                      {formatCnaeCode(c.cnae_code)}
                    </code>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {c.is_primary ? <Badge variant="secondary">Principal</Badge> : null}
                        {!enabled ? <Badge variant="outline">Oculto na emissão</Badge> : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-sm leading-snug">
                        {c.cnae_description || 'Sem descrição'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      <Label
                        htmlFor={`cnae-enabled-${c.id}`}
                        className="text-muted-foreground hidden text-xs font-normal sm:block"
                      >
                        {enabled ? 'Visível' : 'Oculto'}
                      </Label>
                      <Switch
                        id={`cnae-enabled-${c.id}`}
                        checked={enabled}
                        onCheckedChange={(checked) => toggleCnaeMutation.mutate({ cnae: c, enabled: checked })}
                        aria-label={enabled ? 'Ocultar CNAE na emissão' : 'Exibir CNAE na emissão'}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Atividades cadastradas</p>
          {query.isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando atividades…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma atividade cadastrada. Na emissão o CNAE pode ser informado manualmente; cadastre
              atividades para sugerir descrições amigáveis.
            </p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.service_description || item.cnae_description || item.cnae_code}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      CNAE {formatCnaeCode(item.cnae_code)}
                      {item.cnae_description ? ` — ${truncateText(item.cnae_description, 60)}` : ''}
                      {item.status !== 'active' ? ' · Inativo' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                      <PencilIcon />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2Icon />
                      Remover
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-1.5">
              <Label>CNAE *</Label>
              <Select
                value={form.cnae_code}
                onValueChange={(code) => {
                  const hit = companyCnaes.find((c) => c.cnae_code === code);
                  setForm((f) => ({
                    ...f,
                    cnae_code: code,
                    cnae_description: hit?.cnae_description ?? ''
                  }));
                }}
              >
                <SelectTrigger className="w-full min-w-0 max-w-full overflow-hidden [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:truncate">
                  <SelectValue placeholder="Selecione o CNAE" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  className="w-[var(--radix-select-trigger-width)] max-w-[min(var(--radix-select-trigger-width),calc(100vw-3rem))]"
                >
                  {sortedCnaes.map((c) => {
                    const label = `${formatCnaeCode(c.cnae_code)}${c.is_primary ? ' · principal' : ''} — ${
                      c.cnae_description || 'Sem descrição'
                    }`;
                    return (
                      <SelectItem key={c.id} value={c.cnae_code} textValue={label} title={label}>
                        <span className="block max-w-full truncate">{label}</span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label>Descrição *</Label>
              <Input
                className="min-w-0"
                value={form.service_description ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, service_description: e.target.value }))}
                placeholder="Ex.: Manutenção de equipamentos agrícolas"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!form.cnae_code || !form.service_description?.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
