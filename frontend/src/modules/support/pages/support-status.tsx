import { useQuery } from '@tanstack/react-query';
import { AlertCircleIcon, CheckCircle2Icon, RefreshCwIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  getControlPlaneHealth,
  getMe,
  getNfeDistributionStatus,
  listCompanies,
  listIntegrations
} from '@/lib/endpoints';
import type { ApiNfeDistributionPoll } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ServiceStatus } from '@/modules/support/data';

type LiveService = {
  name: string;
  status: ServiceStatus;
  detail: string;
  history: ServiceStatus[];
};

const statusColors: Record<ServiceStatus, string> = {
  operational: '#10b981',
  degraded: '#f59e0b',
  outage: '#ef4444',
  unknown: '#94a3b8'
};

const statusLabels: Record<ServiceStatus, string> = {
  operational: 'Operacional',
  degraded: 'Degradado',
  outage: 'Indisponível',
  unknown: 'Sem dados'
};

function pollOutcomeToStatus(outcome: string | undefined): ServiceStatus {
  if (outcome === 'error') return 'outage';
  if (outcome === 'rate_limited') return 'degraded';
  if (outcome === 'has_more' || outcome === 'no_content') return 'operational';
  return 'unknown';
}

function historyFromPolls(polls: ApiNfeDistributionPoll[]): ServiceStatus[] {
  return [...polls].reverse().slice(-30).map((poll) => pollOutcomeToStatus(poll.outcome));
}

async function probeLiveStatus(token: string | null, organizationId: string | null): Promise<LiveService[]> {
  const api = await getControlPlaneHealth()
    .then((res) => ({
      name: 'API Nexus',
      status: (res.status === 'ok' ? 'operational' : 'degraded') as ServiceStatus,
      detail: res.status === 'ok' ? 'Control plane respondendo' : `Status: ${res.status}`,
      history: [] as ServiceStatus[]
    }))
    .catch(() => ({
      name: 'API Nexus',
      status: 'outage' as const,
      detail: 'Não foi possível alcançar /health',
      history: [] as ServiceStatus[]
    }));

  const auth = token
    ? await getMe(token)
        .then(() => ({
          name: 'Autenticação',
          status: 'operational' as const,
          detail: 'Sessão válida',
          history: [] as ServiceStatus[]
        }))
        .catch((err) => ({
          name: 'Autenticação',
          status: (err instanceof ApiError && err.status === 401 ? 'outage' : 'degraded') as ServiceStatus,
          detail: err instanceof ApiError ? err.message : 'Falha ao validar a sessão',
          history: [] as ServiceStatus[]
        }))
    : {
        name: 'Autenticação',
        status: 'unknown' as const,
        detail: 'Sem sessão para verificar',
        history: [] as ServiceStatus[]
      };

  let distribution: LiveService = {
    name: 'Distribuição NF-e',
    status: 'unknown',
    detail: 'Vincule uma organização para monitorar',
    history: []
  };
  let sefaz: LiveService = {
    name: 'Consulta SEFAZ',
    status: 'unknown',
    detail: 'Sem histórico de consultas nesta conta',
    history: []
  };
  let sap: LiveService = {
    name: 'Integrações SAP',
    status: 'unknown',
    detail: 'Vincule uma organização para monitorar',
    history: []
  };

  if (token && organizationId) {
    const companies = await listCompanies(token, organizationId)
      .then((res) => res.items)
      .catch(() => null);

    if (!companies) {
      distribution = {
        name: 'Distribuição NF-e',
        status: 'degraded',
        detail: 'Não foi possível listar as empresas',
        history: []
      };
    } else if (companies.length === 0) {
      distribution = {
        name: 'Distribuição NF-e',
        status: 'unknown',
        detail: 'Nenhuma empresa cadastrada',
        history: []
      };
    } else {
      const dist = await getNfeDistributionStatus(token, organizationId, companies[0].id, 30)
        .then((res) => res)
        .catch(() => null);
      if (!dist) {
        distribution = {
          name: 'Distribuição NF-e',
          status: 'degraded',
          detail: 'Falha ao ler o cursor de distribuição',
          history: []
        };
      } else {
        const last = dist.polls[0];
        const history = historyFromPolls(dist.polls);
        let status: ServiceStatus = 'operational';
        let detail = dist.state?.last_message || 'Cursor de NSU ativo';
        if (dist.state?.status === 'error' || last?.outcome === 'error') {
          status = 'outage';
          detail = dist.state?.last_message || last?.error_message || 'Erro na última consulta';
        } else if (dist.state?.status === 'paused' || last?.outcome === 'rate_limited') {
          status = 'degraded';
          detail =
            last?.outcome === 'rate_limited'
              ? 'SEFAZ limitou as consultas (cStat 656)'
              : 'Distribuição pausada';
        } else if (!dist.state) {
          status = 'unknown';
          detail = 'Ainda não houve ciclo de distribuição nesta empresa';
        }
        distribution = { name: 'Distribuição NF-e', status, detail, history };
        sefaz = {
          name: 'Consulta SEFAZ',
          status: last ? pollOutcomeToStatus(last.outcome) : status,
          detail: last?.xmotivo || last?.error_message || detail,
          history
        };
      }
    }

    sap = await listIntegrations(token, organizationId)
      .then((res) => ({
        name: 'Integrações SAP',
        status: 'operational' as const,
        detail:
          res.items.length === 0
            ? 'Nenhuma integração cadastrada'
            : `${res.items.length} integração(ões) acessível(is)`,
        history: [] as ServiceStatus[]
      }))
      .catch((err) => ({
        name: 'Integrações SAP',
        status: 'outage' as const,
        detail: err instanceof ApiError ? err.message : 'Falha ao listar integrações',
        history: [] as ServiceStatus[]
      }));
  }

  return [api, auth, distribution, sefaz, sap];
}

export function StatusTab() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  const statusQuery = useQuery({
    queryKey: ['support-system-status', organizationId],
    queryFn: () => probeLiveStatus(token, organizationId),
    refetchInterval: 30_000
  });

  const services = statusQuery.data ?? [];
  const known = services.filter((s) => s.status !== 'unknown');
  const hasOutage = known.some((s) => s.status === 'outage');
  const hasDegraded = known.some((s) => s.status === 'degraded');
  const allOperational = known.length > 0 && known.every((s) => s.status === 'operational');
  const history = services.find((s) => s.history.length > 0)?.history ?? [];
  const uptimePct =
    history.length > 0
      ? ((history.filter((d) => d === 'operational').length / history.length) * 100).toFixed(0)
      : null;

  return (
    <div className="space-y-4">
      <Card className={hasOutage || hasDegraded ? 'ring-1 ring-amber-500/20' : 'ring-1 ring-emerald-500/20'}>
        <CardContent className="flex items-center gap-4 py-6">
          {statusQuery.isLoading ? (
            <Skeleton className="size-14 rounded-2xl" />
          ) : (
            <div
              className={cn(
                'flex size-14 items-center justify-center rounded-2xl',
                hasOutage || hasDegraded
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              )}
            >
              {hasOutage || hasDegraded ? (
                <AlertCircleIcon className="size-7" />
              ) : (
                <CheckCircle2Icon className="size-7" />
              )}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {statusQuery.isLoading
                ? 'Verificando serviços...'
                : hasOutage
                  ? 'Serviço indisponível'
                  : hasDegraded
                    ? 'Degradação parcial'
                    : allOperational
                      ? 'Todos os sistemas operacionais'
                      : 'Status parcial'}
            </p>
            <p className="text-muted-foreground text-sm">
              Consulta ao vivo em /health, sessão, distribuição NF-e e integrações. Atualiza a cada 30s.
            </p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            {uptimePct && (
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums">{uptimePct}%</p>
                <p className="text-muted-foreground text-xs">ciclos recentes</p>
              </div>
            )}
            <Button type="button" variant="outline" size="icon" onClick={() => void statusQuery.refetch()}>
              <RefreshCwIcon className={cn(statusQuery.isFetching && 'animate-spin')} />
              <span className="sr-only">Atualizar status</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status dos serviços</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusQuery.isLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)
            : services.map((service) => (
                <div key={service.name} className="flex items-center gap-4 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{service.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{service.detail}</p>
                  </div>
                  {service.history.length > 0 && (
                    <div className="hidden items-center gap-[1.5px] md:flex">
                      {service.history.map((status, index) => (
                        <Tooltip key={`${service.name}-${index}`}>
                          <TooltipTrigger asChild>
                            <div className="h-6 w-[4px] rounded-sm" style={{ backgroundColor: statusColors[status] }} />
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="text-xs">
                              ciclo {index + 1} · {statusLabels[status]}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  )}
                  <div className="flex min-w-[110px] items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: statusColors[service.status] }} />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        service.status === 'operational'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : service.status === 'degraded'
                            ? 'text-amber-600 dark:text-amber-400'
                            : service.status === 'outage'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-muted-foreground'
                      )}
                    >
                      {statusLabels[service.status]}
                    </span>
                  </div>
                </div>
              ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Histórico recente da SEFAZ</CardTitle>
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-emerald-500" /> No ar
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-amber-500" /> Degradado
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-sm bg-rose-500" /> Fora
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Ainda não há ciclos de distribuição registrados para montar o histórico. Ele aparece depois da
              primeira consulta à SEFAZ.
            </p>
          ) : (
            <>
              <div className="flex h-8 gap-[1.5px]">
                {history.map((status, index) => (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-full min-w-0 flex-1 rounded-sm"
                        style={{ backgroundColor: statusColors[status] }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="text-xs">
                        ciclo {index + 1} · {statusLabels[status]}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                <span>Mais antigo</span>
                <span className="text-foreground font-medium tabular-nums">{uptimePct}% operacional</span>
                <span>Mais recente</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
