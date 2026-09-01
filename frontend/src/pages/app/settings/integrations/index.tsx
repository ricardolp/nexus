import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, PencilIcon, PlugZapIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  createIntegration,
  listIntegrations,
  updateIntegration,
  type CreateIntegrationInput,
  type UpdateIntegrationInput
} from '@/lib/endpoints';
import type { ApiIntegration } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { SectionNav } from '@/components/layout/section-nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { IntegrationFormDialog } from './integration-form-dialog';
import { ApiKeysPanel } from './api-keys-panel';
import { integrationSystems, type IntegrationSystem } from './systems';

const statusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  disabled: { label: 'Desabilitado', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

type IntegrationsTab = 'sistemas' | 'tokens';

const tabs: { id: IntegrationsTab; label: string; icon: ReactNode }[] = [
  { id: 'sistemas', label: 'Sistemas', icon: <PlugZapIcon className="size-4" /> },
  { id: 'tokens', label: 'Tokens de entrada', icon: <KeyRoundIcon className="size-4" /> }
];

function SystemLogo({ system }: { system: IntegrationSystem }) {
  if (system.logoSrc) {
    return (
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white p-2">
        <img src={system.logoSrc} alt="" className="size-full object-contain" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-xl text-xs font-bold',
        system.logoClassName
      )}
    >
      {system.logoText}
    </div>
  );
}

export default function IntegrationsPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const queryKey = ['integrations', organizationId];
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: IntegrationsTab = searchParams.get('tab') === 'tokens' ? 'tokens' : 'sistemas';

  const [formOpen, setFormOpen] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<ApiIntegration | null>(null);

  const enabled = !!token && !!organizationId;

  const integrationsQuery = useQuery({
    queryKey,
    queryFn: () => listIntegrations(token!, organizationId!),
    enabled
  });

  const integrations = integrationsQuery.data?.items ?? [];

  const integrationBySystem = useMemo(() => {
    const map: Record<string, ApiIntegration> = {};
    for (const integration of integrations) {
      map[integration.integration_type] = integration;
    }
    return map;
  }, [integrations]);

  const availableSystems = integrationSystems.filter((system) => system.supported);
  const upcomingSystems = integrationSystems.filter((system) => !system.supported);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: (input: CreateIntegrationInput) => createIntegration(token!, organizationId!, input),
    onSuccess: (integration) => {
      toast.success('Integração adicionada', { description: integration.name });
      setFormOpen(false);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível adicionar a integração.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateIntegrationInput) =>
      updateIntegration(token!, organizationId!, editingIntegration!.id, input),
    onSuccess: (integration) => {
      toast.success('Integração atualizada', { description: integration.name });
      setFormOpen(false);
      setEditingIntegration(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar a integração.');
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: (integration: ApiIntegration) =>
      updateIntegration(token!, organizationId!, integration.id, {
        name: integration.name,
        base_url: integration.base_url ?? '',
        status: integration.status === 'active' ? 'disabled' : 'active',
        configuration: integration.configuration_json
      }),
    onSuccess: (integration) => {
      toast.success(integration.status === 'active' ? 'Integração ativada' : 'Integração desativada', {
        description: integration.name
      });
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  });

  const activeSystemForDialog = editingIntegration
    ? integrationSystems.find((s) => s.integrationType === editingIntegration.integration_type)
    : integrationSystems.find((s) => s.id === 'sap');

  function setTab(next: IntegrationsTab) {
    const params = new URLSearchParams(searchParams);
    if (next === 'sistemas') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  }

  function openForm(integration?: ApiIntegration) {
    setEditingIntegration(integration ?? null);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Integrações</h2>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Configure como o Nexus fala com o SAP e os tokens que o SAP usa para enviar documentos.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <SectionNav items={tabs} value={tab} onChange={setTab} />

        <div className="min-w-0 flex-1">
          {tab === 'sistemas' ? (
            <div className="flex flex-col gap-8">
              <div>
                <h3 className="text-base font-semibold">Chamadas ao SAP</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  Credenciais que o Nexus usa para consultar e devolver dados no ERP.
                </p>
              </div>

              {!organizationId ? (
                <p className="text-muted-foreground text-sm">
                  Nenhuma organização associada à sua conta no momento.
                </p>
              ) : integrationsQuery.isLoading ? (
                <Skeleton className="h-36 w-full" />
              ) : integrationsQuery.isError ? (
                <p className="text-destructive text-sm">
                  {integrationsQuery.error instanceof ApiError
                    ? integrationsQuery.error.message
                    : 'Não foi possível carregar as integrações.'}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {availableSystems.map((system) => {
                    const integration = integrationBySystem[system.integrationType];
                    const status = integration ? statusLabels[integration.status] : null;

                    return (
                      <Card key={system.id}>
                        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-start gap-4">
                            <SystemLogo system={system} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-base">{system.name}</CardTitle>
                                {status ? (
                                  <Badge variant="outline" className={status.className}>
                                    {status.label}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    Não configurado
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="mt-1">{system.description}</CardDescription>
                              {integration?.base_url ? (
                                <p className="text-muted-foreground mt-2 truncate font-mono text-xs">
                                  {integration.base_url}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                            {integration ? (
                              <>
                                <Button variant="outline" onClick={() => openForm(integration)}>
                                  <PencilIcon />
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  onClick={() => toggleStatusMutation.mutate(integration)}
                                  disabled={toggleStatusMutation.isPending}
                                >
                                  {integration.status === 'active' ? 'Desativar' : 'Ativar'}
                                </Button>
                              </>
                            ) : (
                              <Button onClick={() => openForm()}>
                                <PlusIcon />
                                Configurar
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {upcomingSystems.length > 0 ? (
                <div className="flex flex-col gap-3">
                  <h3 className="text-muted-foreground text-sm font-medium">Em breve</h3>
                  <div className="divide-border rounded-xl border">
                    {upcomingSystems.map((system) => (
                      <div
                        key={system.id}
                        className="flex items-center gap-3 px-4 py-3 opacity-70 first:rounded-t-xl last:rounded-b-xl"
                      >
                        <SystemLogo system={system} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{system.name}</p>
                          <p className="text-muted-foreground truncate text-xs">{system.description}</p>
                        </div>
                        <Badge variant="secondary">Em breve</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <ApiKeysPanel />
          )}
        </div>
      </div>

      {activeSystemForDialog && (
        <IntegrationFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditingIntegration(null);
          }}
          integration={editingIntegration}
          systemName={activeSystemForDialog.name}
          submitting={createMutation.isPending || updateMutation.isPending}
          onSubmit={async (values) => {
            if (editingIntegration) {
              await updateMutation.mutateAsync(values as UpdateIntegrationInput);
            } else {
              await createMutation.mutateAsync(values as CreateIntegrationInput);
            }
          }}
        />
      )}
    </div>
  );
}
