import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIcon,
  AlertTriangleIcon,
  Building2Icon,
  FileTextIcon,
  LayersIcon,
  RadioTowerIcon,
  RefreshCwIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { getPlatformStatus } from '@/lib/endpoints';
import { formatCNPJ } from '@/pages/app/settings/companies/columns';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AdminStatusPage() {
  const token = useAuthStore((s) => s.token);

  const statusQuery = useQuery({
    queryKey: ['admin-platform-status'],
    queryFn: () => getPlatformStatus(token!),
    enabled: !!token,
    refetchInterval: 30_000
  });

  const status = statusQuery.data;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ActivityIcon className="text-muted-foreground size-5" />
              Status da plataforma
            </CardTitle>
            <CardDescription>
              Saúde agregada do control plane — independente de organização na sessão.
              {status && (
                <span className="ml-1">Atualizado em {formatDateTime(status.generated_at)}.</span>
              )}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={statusQuery.isFetching}
            onClick={() => statusQuery.refetch()}
          >
            <RefreshCwIcon className={statusQuery.isFetching ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : statusQuery.isError ? (
            <p className="text-destructive text-sm">
              {statusQuery.error instanceof ApiError
                ? statusQuery.error.message
                : 'Não foi possível carregar o status.'}
            </p>
          ) : status ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatusCard
                icon={ActivityIcon}
                label="Control plane"
                value={status.control_plane === 'ok' ? 'Operacional' : status.control_plane}
                tone={status.control_plane === 'ok' ? 'ok' : 'bad'}
              />
              <StatusCard
                icon={LayersIcon}
                label="Organizações"
                value={`${status.organizations_active} ativas · ${status.organizations_suspended} suspensas`}
              />
              <StatusCard
                icon={FileTextIcon}
                label="Documentos (24h)"
                value={status.documents_last_24h.toLocaleString('pt-BR')}
              />
              <StatusCard
                icon={AlertTriangleIcon}
                label="Erros (24h)"
                value={status.errors_last_24h.toLocaleString('pt-BR')}
                tone={status.errors_last_24h > 0 ? 'warn' : 'ok'}
              />
              <StatusCard
                icon={RadioTowerIcon}
                label="Distribuição NF-e"
                value={`${status.distribution.active} ativas · ${status.distribution.paused} pausadas · ${status.distribution.error} em erro`}
                tone={status.distribution.error > 0 ? 'bad' : 'ok'}
              />
              <StatusCard
                icon={Building2Icon}
                label="Outbox"
                value={`${status.outbox_pending} pendentes · ${status.outbox_failed} falhas`}
                tone={status.outbox_failed > 0 ? 'warn' : 'ok'}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {status && status.distribution_errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Empresas com distribuição em erro</CardTitle>
            <CardDescription>Até 20 empresas com status de distribuição = error</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organização</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.distribution_errors.map((row) => (
                  <TableRow key={row.company_id}>
                    <TableCell>
                      <Link
                        to={`/admin/organizations/${row.organization_id}`}
                        className="text-primary hover:underline"
                      >
                        {row.organization_legal_name}
                      </Link>
                    </TableCell>
                    <TableCell>{row.company_legal_name}</TableCell>
                    <TableCell className="tabular-nums">{formatCNPJ(row.cnpj)}</TableCell>
                    <TableCell
                      className="text-muted-foreground max-w-xs truncate text-sm"
                      title={row.last_message ?? ''}
                    >
                      {row.last_message ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/admin/nfe-distribution?organizationId=${row.organization_id}&companyId=${row.company_id}`}
                        >
                          Abrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="text-base font-medium">
          {tone === 'ok' && (
            <Badge variant="outline" className="mb-2 bg-emerald-500/10 text-emerald-600">
              OK
            </Badge>
          )}
          {tone === 'warn' && (
            <Badge variant="outline" className="mb-2 bg-amber-500/10 text-amber-600">
              Atenção
            </Badge>
          )}
          {tone === 'bad' && (
            <Badge variant="outline" className="mb-2 bg-red-500/10 text-red-600">
              Problema
            </Badge>
          )}
          <div>{value}</div>
        </CardTitle>
      </CardHeader>
    </Card>
  );
}
