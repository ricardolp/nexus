import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListIcon, SearchIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import type { ApiRequestTrace } from '@/lib/api-types';
import { getRequestTrace, listOrganizations, listRequestTraces } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
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

export default function AdminRequestsPage() {
  const token = useAuthStore((s) => s.token);
  const [organizationId, setOrganizationId] = useState<string>('all');
  const [httpStatus, setHttpStatus] = useState<string>('');
  const [spanName, setSpanName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: ['admin-organizations'],
    queryFn: () => listOrganizations(token!),
    enabled: !!token
  });

  const tracesQuery = useQuery({
    queryKey: ['admin-request-traces', organizationId, httpStatus, spanName],
    queryFn: () =>
      listRequestTraces(token!, {
        organization_id: organizationId === 'all' ? undefined : organizationId,
        http_status: httpStatus ? Number(httpStatus) : undefined,
        span_name: spanName.trim() || undefined,
        limit: 50
      }),
    enabled: !!token
  });

  const detailQuery = useQuery({
    queryKey: ['admin-request-trace', selectedId],
    queryFn: () => getRequestTrace(token!, selectedId!),
    enabled: !!token && !!selectedId
  });

  const items = tracesQuery.data?.items ?? [];
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const org of orgsQuery.data?.items ?? []) {
      map.set(org.id, org.legal_name);
    }
    return map;
  }, [orgsQuery.data]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListIcon className="text-muted-foreground size-5" />
            Requisições
          </CardTitle>
          <CardDescription>
            Traces do inbound fiscal (`request_traces`). Hoje só a API de documentos fiscais grava
            aqui — o browsing do painel admin não aparece nesta lista.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3">
            <div className="w-full max-w-xs">
              <Select value={organizationId} onValueChange={setOrganizationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Organização" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as organizações</SelectItem>
                  {(orgsQuery.data?.items ?? []).map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.legal_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              className="w-28"
              placeholder="HTTP status"
              value={httpStatus}
              onChange={(e) => setHttpStatus(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
            <div className="relative w-full max-w-sm">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                className="pl-8"
                placeholder="span_name (ex.: inbound.fiscal_documents)"
                value={spanName}
                onChange={(e) => setSpanName(e.target.value)}
              />
            </div>
          </div>

          {tracesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tracesQuery.isError ? (
            <p className="text-destructive text-sm">
              {tracesQuery.error instanceof ApiError
                ? tracesQuery.error.message
                : 'Não foi possível carregar as requisições.'}
            </p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma requisição encontrada com esses filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Início</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Span</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((trace) => (
                  <TableRow key={trace.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(trace.started_at)}</TableCell>
                    <TableCell>
                      {trace.organization_id
                        ? (orgNameById.get(trace.organization_id) ?? trace.organization_id.slice(0, 8))
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{trace.span_name}</TableCell>
                    <TableCell>{trace.http_method ?? '—'}</TableCell>
                    <TableCell className="max-w-[220px] truncate font-mono text-xs" title={trace.http_path ?? ''}>
                      {trace.http_path ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {trace.http_status != null ? (
                        <Badge variant="outline">{trace.http_status}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(trace.id)}>
                        Detalhe
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Detalhe da requisição</SheetTitle>
            <SheetDescription>Metadados do trace — sem payload bruto.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3 text-sm">
            {detailQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : detailQuery.isError ? (
              <p className="text-destructive">
                {detailQuery.error instanceof ApiError
                  ? detailQuery.error.message
                  : 'Falha ao carregar o detalhe.'}
              </p>
            ) : detailQuery.data ? (
              <TraceDetail trace={detailQuery.data} orgName={orgNameById} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function TraceDetail({
  trace,
  orgName
}: {
  trace: ApiRequestTrace;
  orgName: Map<string, string>;
}) {
  const rows: Array<[string, string]> = [
    ['ID', trace.id],
    [
      'Organização',
      trace.organization_id
        ? (orgName.get(trace.organization_id) ?? trace.organization_id)
        : '—'
    ],
    ['Correlation ID', trace.correlation_id],
    ['Trace ID', trace.trace_id],
    ['Span', trace.span_name],
    ['Método', trace.http_method ?? '—'],
    ['Path', trace.http_path ?? '—'],
    ['HTTP status', trace.http_status != null ? String(trace.http_status) : '—'],
    ['Duração (ms)', trace.duration_ms != null ? String(trace.duration_ms) : '—'],
    ['Actor', [trace.actor_type, trace.actor_id].filter(Boolean).join(' / ') || '—'],
    ['Request hash', trace.request_hash ?? '—'],
    ['Storage key', trace.storage_object_key ?? '—'],
    ['Início', formatDateTime(trace.started_at)],
    ['Fim', formatDateTime(trace.finished_at)]
  ];

  return (
    <dl className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[120px_1fr] gap-2 border-b py-2 last:border-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all font-mono text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
