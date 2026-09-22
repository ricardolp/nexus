import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, ScrollTextIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import type { ApiIntegrationLog } from '@/lib/api-types';
import { getIntegrationLog, listIntegrationLogs } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GradientDialogHeader } from '@/components/ui/gradient-dialog-header';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

const levelFilters = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Error' },
  { id: 'warn', label: 'Warn' },
  { id: 'info', label: 'Info' },
  { id: 'debug', label: 'Debug' }
] as const;

const levelBadgeClass: Record<string, string> = {
  error: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
  debug: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
};

function formatTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit'
  });
}

function shortId(id: string) {
  return id.replace(/-/g, '').slice(0, 8);
}

function formatHeaders(value: ApiIntegrationLog['request_headers_json']) {
  if (!value || typeof value !== 'object') return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function IntegrationLogsPanel() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const [level, setLevel] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const enabled = !!token && !!organizationId;

  const listQuery = useQuery({
    queryKey: ['integration-logs', organizationId, level, page],
    queryFn: () =>
      listIntegrationLogs(token!, organizationId!, {
        page,
        limit: PAGE_SIZE,
        level: level === 'all' ? undefined : level
      }),
    enabled
  });

  const detailQuery = useQuery({
    queryKey: ['integration-log', organizationId, selectedId],
    queryFn: () => getIntegrationLog(token!, organizationId!, selectedId!),
    enabled: enabled && !!selectedId
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const errorCount = listQuery.data?.error_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollTextIcon className="text-muted-foreground size-5" />
              Application Logs
            </CardTitle>
            <CardDescription className="mt-1">
              {total} entradas · {errorCount} errors
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {levelFilters.map((f) => (
              <Button
                key={f.id}
                type="button"
                size="sm"
                variant={level === f.id ? 'secondary' : 'ghost'}
                className="h-8"
                onClick={() => {
                  setLevel(f.id);
                  setPage(1);
                }}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!organizationId ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma organização associada à sua conta no momento.
            </p>
          ) : listQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <p className="text-destructive text-sm">
              {listQuery.error instanceof ApiError
                ? listQuery.error.message
                : 'Não foi possível carregar os logs de integração.'}
            </p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum log encontrado para este filtro.</p>
          ) : (
            <ul className="divide-border divide-y rounded-lg border">
              {items.map((log) => {
                const lvl = (log.level || 'info').toLowerCase();
                return (
                  <li key={log.id}>
                    <button
                      type="button"
                      className="hover:bg-muted/40 flex w-full flex-col gap-1 px-3 py-3 text-left sm:flex-row sm:items-start sm:gap-3"
                      onClick={() => setSelectedId(log.id)}
                    >
                      <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                        {formatTime(log.started_at)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('w-fit shrink-0 uppercase', levelBadgeClass[lvl] ?? levelBadgeClass.info)}
                      >
                        {lvl}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {log.origin || log.span_name}
                          {log.destination ? (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              → {log.destination}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-sm">
                          {log.summary || `${log.http_method ?? ''} ${log.http_path ?? ''}`.trim() || log.span_name}
                        </span>
                      </span>
                      <span className="text-muted-foreground flex shrink-0 items-center gap-2 font-mono text-xs">
                        {log.http_status != null ? (
                          <Badge variant="outline">{log.http_status}</Badge>
                        ) : null}
                        {shortId(log.id)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {total > 0 ? (
            <div className="flex items-center justify-between gap-3 pt-1">
              <p className="text-muted-foreground text-xs">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || listQuery.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeftIcon className="size-4" />
                  Anterior
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || listQuery.isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <GradientDialogHeader
            icon={ScrollTextIcon}
            title="Detalhe do log"
            description="Origem, destino, headers, body e response da requisição."
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm">
            {detailQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : detailQuery.isError ? (
              <p className="text-destructive">
                {detailQuery.error instanceof ApiError
                  ? detailQuery.error.message
                  : 'Falha ao carregar o detalhe.'}
              </p>
            ) : detailQuery.data ? (
              <LogDetail log={detailQuery.data} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LogDetail({ log }: { log: ApiIntegrationLog }) {
  const rows: Array<[string, string]> = [
    ['ID', log.id],
    ['Nível', log.level ?? '—'],
    ['Direção', log.direction ?? '—'],
    ['Origem', log.origin ?? '—'],
    ['Destino', log.destination ?? '—'],
    ['Span', log.span_name],
    ['Método', log.http_method ?? '—'],
    ['Path', log.http_path ?? '—'],
    ['HTTP status', log.http_status != null ? String(log.http_status) : '—'],
    ['Duração (ms)', log.duration_ms != null ? String(log.duration_ms) : '—'],
    ['Início', formatTime(log.started_at)],
    ['Fim', formatTime(log.finished_at)],
    ['Correlation', log.correlation_id],
    ['Trace', log.trace_id]
  ];

  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-0.5 break-all font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <PreviewBlock title="Request headers" value={formatHeaders(log.request_headers_json)} />
        <PreviewBlock title="Response headers" value={formatHeaders(log.response_headers_json)} />
        <PreviewBlock title="Request body" value={log.request_body_preview || '—'} />
        <PreviewBlock title="Response body" value={log.response_body_preview || '—'} />
      </div>
    </div>
  );
}

function PreviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">{title}</p>
      <pre className="bg-muted/50 max-h-56 overflow-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap break-all">
        {value}
      </pre>
    </div>
  );
}
