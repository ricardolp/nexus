import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { RadioTowerIcon, RefreshCwIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import { getNfeDistributionStatus, listCompanies, listOrganizations } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

const stateStatusLabels: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  paused: { label: 'Pausada', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

const outcomeLabels: Record<string, { label: string; className: string }> = {
  has_more: { label: 'Mais documentos', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  no_content: { label: 'Em dia', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  rate_limited: { label: 'Limite SEFAZ (656)', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-600 dark:text-red-400' }
};

export default function NfeDistributionPage() {
  const token = useAuthStore((s) => s.token);
  const [searchParams] = useSearchParams();
  const initialOrg = searchParams.get('organizationId') ?? '';
  const initialCompany = searchParams.get('companyId') ?? '';
  const [organizationId, setOrganizationId] = useState<string>(initialOrg);
  const [companyId, setCompanyId] = useState<string>(initialCompany);
  const [skipCompanyReset, setSkipCompanyReset] = useState(!!initialCompany);

  const organizationsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const companiesQuery = useQuery({
    queryKey: ['admin-companies', organizationId],
    queryFn: () => listCompanies(token!, organizationId),
    enabled: !!token && !!organizationId
  });

  const companies = companiesQuery.data?.items ?? [];

  // Empresa some da lista ao trocar de organização — evita mandar um
  // company_id que pertence à organização anterior. Deep-links preservam
  // o companyId na primeira montagem.
  useEffect(() => {
    if (skipCompanyReset) {
      setSkipCompanyReset(false);
      return;
    }
    setCompanyId('');
  }, [organizationId]);

  useEffect(() => {
    const org = searchParams.get('organizationId') ?? '';
    const company = searchParams.get('companyId') ?? '';
    if (org && org !== organizationId) {
      setSkipCompanyReset(!!company);
      setOrganizationId(org);
    }
    if (company) {
      setCompanyId(company);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL only when searchParams change
  }, [searchParams]);

  const statusQuery = useQuery({
    queryKey: ['nfe-distribution-status', organizationId, companyId],
    queryFn: () => getNfeDistributionStatus(token!, organizationId, companyId, 100),
    enabled: !!token && !!organizationId && !!companyId,
    refetchInterval: 30_000
  });

  const selectedCompany = companies.find((c) => c.id === companyId);
  const state = statusQuery.data?.state;
  const polls = statusQuery.data?.polls ?? [];
  const backlog = state ? Math.max(state.max_nsu - state.last_nsu, 0) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <RadioTowerIcon className="text-muted-foreground size-5" />
            Distribuição NF-e (SEFAZ)
          </CardTitle>
          <CardDescription>
            Governança do nfe-gateway: cursor de NSU e histórico de tentativas de consulta à SEFAZ, por
            empresa — dados reais, gravados pelo serviço Python a cada tentativa (automática ou sob
            demanda).
          </CardDescription>
        </div>
        {companyId && (
          <Button
            variant="outline"
            size="sm"
            disabled={statusQuery.isFetching}
            onClick={() => statusQuery.refetch()}
          >
            <RefreshCwIcon className={statusQuery.isFetching ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Organização</span>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma organização" />
              </SelectTrigger>
              <SelectContent>
                {(organizationsQuery.data?.items ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.legal_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Empresa</span>
            <Select value={companyId} onValueChange={setCompanyId} disabled={!organizationId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={organizationId ? 'Selecione uma empresa' : 'Escolha a organização primeiro'}
                />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.legal_name} · {formatCNPJ(company.cnpj)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!companyId ? (
          <p className="text-muted-foreground text-sm">
            Selecione uma organização e uma empresa para ver o estado da distribuição e o log de
            consultas.
          </p>
        ) : statusQuery.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : statusQuery.isError ? (
          <p className="text-destructive text-sm">
            {statusQuery.error instanceof ApiError
              ? statusQuery.error.message
              : 'Não foi possível carregar o status de distribuição.'}
          </p>
        ) : !state ? (
          <p className="text-muted-foreground text-sm">
            {selectedCompany?.legal_name} ainda não tem a distribuição automática ativada — nenhuma linha
            de estado foi criada pra essa empresa.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 rounded-md border p-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Status</span>
                <Badge
                  variant="outline"
                  className={
                    (stateStatusLabels[state.status] ?? { label: state.status, className: '' }).className
                  }
                >
                  {(stateStatusLabels[state.status] ?? { label: state.status }).label}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">NSU atual / máximo</span>
                <span className="text-sm font-medium">
                  {state.last_nsu} / {state.max_nsu}
                  {backlog !== null && backlog > 0 && (
                    <span className="text-muted-foreground font-normal"> · {backlog} pendentes</span>
                  )}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Último cStat</span>
                <span className="text-sm font-medium">{state.last_cstat ?? '—'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Próxima consulta permitida</span>
                <span className="text-sm font-medium">{formatDateTime(state.next_allowed_poll_at)}</span>
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
                <span className="text-muted-foreground text-xs">Última consulta bem-sucedida</span>
                <span className="text-sm font-medium">{formatDateTime(state.last_success_at)}</span>
              </div>
              {state.last_message && (
                <div className="col-span-2 flex flex-col gap-1 sm:col-span-4">
                  <span className="text-muted-foreground text-xs">Última mensagem de erro</span>
                  <span className="text-destructive text-sm">{state.last_message}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Histórico de consultas</h3>
              {polls.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma tentativa registrada ainda.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Início</TableHead>
                        <TableHead>NSU pedido</TableHead>
                        <TableHead>cStat</TableHead>
                        <TableHead>Resultado</TableHead>
                        <TableHead>Documentos</TableHead>
                        <TableHead>ultNSU / maxNSU</TableHead>
                        <TableHead>Detalhe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {polls.map((poll) => (
                        <TableRow key={poll.id}>
                          <TableCell className="whitespace-nowrap">{formatDateTime(poll.started_at)}</TableCell>
                          <TableCell>{poll.requested_nsu}</TableCell>
                          <TableCell>{poll.cstat ?? '—'}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                (outcomeLabels[poll.outcome] ?? { label: poll.outcome, className: '' })
                                  .className
                              }
                            >
                              {(outcomeLabels[poll.outcome] ?? { label: poll.outcome }).label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{poll.documents_found} encontrados</span>
                              {(poll.documents_ingested > 0 || poll.documents_summary_only > 0) && (
                                <span className="text-muted-foreground text-xs">
                                  {poll.documents_ingested} ingeridos
                                  {poll.documents_summary_only > 0 &&
                                    `, ${poll.documents_summary_only} só resumo`}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {poll.ult_nsu ?? '—'} / {poll.max_nsu ?? '—'}
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground max-w-xs truncate text-xs"
                            title={poll.error_message ?? poll.xmotivo ?? ''}
                          >
                            {poll.error_message ?? poll.xmotivo ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
