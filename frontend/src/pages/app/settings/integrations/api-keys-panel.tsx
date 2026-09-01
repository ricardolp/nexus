import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRoundIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  createAPIClient,
  listAPIClients,
  revokeAPIClient,
  rotateAPIClientInboundToken,
  type CreateAPIClientInput
} from '@/lib/endpoints';
import type { ApiAPIClient, CreatedApiClient } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatRelativeTime } from '@/pages/app/fiscal/format';
import { ApiKeyCreatedDialog, CreateApiKeyDialog, RevokeApiKeyDialog } from './api-key-dialogs';

const scopeStyles: Record<string, { label: string; className: string }> = {
  'leitura-escrita': {
    label: 'Completo',
    className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
  },
  entrada: {
    label: 'Entrada',
    className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  },
  saida: {
    label: 'Saída',
    className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300'
  },
  leitura: {
    label: 'Leitura',
    className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
  },
  personalizado: {
    label: 'Personalizado',
    className: 'text-muted-foreground'
  }
};

function scopeBadge(scopes: string[]) {
  if (scopes.includes('fiscal_documents:create')) return scopeStyles['leitura-escrita'];
  const inbound = scopes.includes('fiscal_documents:inbound:create');
  const outbound = scopes.includes('fiscal_documents:outbound:create');
  if (inbound && outbound) return scopeStyles['leitura-escrita'];
  if (inbound) return scopeStyles.entrada;
  if (outbound) return scopeStyles.saida;
  if (scopes.includes('fiscal_documents:read')) return scopeStyles.leitura;
  return scopeStyles.personalizado;
}

function maskApiKey(client: ApiAPIClient) {
  if (client.token_hint) return `nx_••••${client.token_hint}`;
  const id = client.client_id;
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function ApiKeysPanel() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const queryKey = ['api-clients', organizationId];

  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiClient | null>(null);
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiAPIClient | null>(null);

  const enabled = !!token && !!organizationId;

  const query = useQuery({
    queryKey,
    queryFn: () => listAPIClients(token!, organizationId!),
    enabled
  });

  const keys = query.data?.items ?? [];
  const activeKeys = useMemo(() => keys.filter((key) => key.status === 'active'), [keys]);
  const totalRequests = useMemo(
    () => keys.reduce((sum, key) => sum + (key.request_count ?? 0), 0),
    [keys]
  );

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey });
  }

  const createMutation = useMutation({
    mutationFn: (input: CreateAPIClientInput) => createAPIClient(token!, organizationId!, input),
    onSuccess: (result) => {
      setCreateOpen(false);
      setCreated(result);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar o token.');
    }
  });

  const rotateMutation = useMutation({
    mutationFn: (client: ApiAPIClient) => rotateAPIClientInboundToken(token!, organizationId!, client.id),
    onSuccess: (result) => {
      setRotatedToken(result.org_token);
      toast.success('Novo token gerado');
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar um novo token.');
    }
  });

  const revokeMutation = useMutation({
    mutationFn: (client: ApiAPIClient) => revokeAPIClient(token!, organizationId!, client.id),
    onSuccess: () => {
      toast.success('Token revogado', { description: revokeTarget?.name });
      setRevokeTarget(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível revogar o token.');
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Tokens de entrada</h3>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm">
            O SAP autentica os POSTs nesta aplicação com um destes tokens.
          </p>
        </div>
        <Button disabled={!organizationId} onClick={() => setCreateOpen(true)}>
          <PlusIcon />
          Criar token
        </Button>
      </div>

      <ol className="text-muted-foreground grid gap-3 text-sm sm:grid-cols-3">
        <li className="bg-muted/40 rounded-xl border px-4 py-3">
          <span className="text-foreground font-medium">1. Crie um token</span>
          <p className="mt-1">Dê um nome, por exemplo Compras ou Homologação.</p>
        </li>
        <li className="bg-muted/40 rounded-xl border px-4 py-3">
          <span className="text-foreground font-medium">2. Copie na hora</span>
          <p className="mt-1">O valor completo aparece uma única vez, depois some.</p>
        </li>
        <li className="bg-muted/40 rounded-xl border px-4 py-3">
          <span className="text-foreground font-medium">3. Configure no SAP</span>
          <p className="mt-1">
            Use o header <code className="text-foreground">X-Org-Token</code> no iFlow.
          </p>
        </li>
      </ol>

      {!organizationId ? (
        <p className="text-muted-foreground text-sm">Nenhuma organização associada à sua conta no momento.</p>
      ) : query.isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="text-destructive text-sm">
          {query.error instanceof ApiError
            ? query.error.message
            : 'Não foi possível carregar os tokens de entrada.'}
        </p>
      ) : keys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
              <KeyRoundIcon className="size-5" />
            </div>
            <div>
              <p className="font-medium">Nenhum token ainda</p>
              <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                Crie o primeiro para o SAP conseguir enviar documentos de entrada.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon />
              Criar token
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {keys.map((client) => {
            const scope = scopeBadge(client.scopes ?? []);
            const revoked = client.status === 'revoked';
            return (
              <Card key={client.id} className={revoked ? 'opacity-60' : undefined}>
                <CardContent className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{client.name}</p>
                    <Badge variant="outline" className={scope.className}>
                      {scope.label}
                    </Badge>
                    {revoked ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Revogado
                      </Badge>
                    ) : null}
                  </div>

                  <code className="bg-muted text-muted-foreground block truncate rounded-lg px-3 py-2.5 font-mono text-sm">
                    {maskApiKey(client)}
                  </code>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Stat label="Criado em" value={formatDate(client.created_at)} />
                    <Stat
                      label="Último uso"
                      value={client.last_used_at ? formatRelativeTime(client.last_used_at) : 'Nunca'}
                    />
                    <Stat
                      label="Requisições"
                      value={(client.request_count ?? 0).toLocaleString('pt-BR')}
                    />
                  </div>

                  {!revoked ? (
                    <div className="flex flex-wrap gap-2 border-t pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={rotateMutation.isPending}
                        onClick={() => rotateMutation.mutate(client)}
                      >
                        <RefreshCwIcon />
                        Gerar novo token
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRevokeTarget(client)}
                      >
                        <Trash2Icon />
                        Revogar
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
          <p className="text-muted-foreground text-xs">
            {activeKeys.length} {activeKeys.length === 1 ? 'token ativo' : 'tokens ativos'}
            {' · '}
            {totalRequests.toLocaleString('pt-BR')} requisições no total
          </p>
        </div>
      )}

      <CreateApiKeyDialog
        open={createOpen}
        submitting={createMutation.isPending}
        onOpenChange={setCreateOpen}
        onSubmit={async (values) => {
          await createMutation.mutateAsync({
            name: values.name,
            source_system: values.source_system,
            scopes: values.scopes,
            generate_org_token: true
          });
        }}
      />
      <ApiKeyCreatedDialog
        created={created}
        rotatedToken={rotatedToken}
        onOpenChange={(open) => {
          if (!open) {
            setCreated(null);
            setRotatedToken(null);
          }
        }}
      />
      <RevokeApiKeyDialog
        name={revokeTarget?.name ?? null}
        pending={revokeMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        onConfirm={() => {
          if (revokeTarget) revokeMutation.mutate(revokeTarget);
        }}
      />
    </div>
  );
}
