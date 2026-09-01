import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';

import { listSecurityEvents } from '@/lib/endpoints';
import type { ApiSecurityEvent } from '@/lib/api-types';
import { formatDateTime } from '@/pages/app/fiscal/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  downloadCsv,
  eventMeta,
  groupEventsByDay,
  parseUserAgent,
  type EventCategory
} from './helpers';

const filters: { id: 'all' | EventCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'security', label: 'Segurança' },
  { id: 'login', label: 'Login' },
  { id: 'settings', label: 'Configurações' }
];

function categoryBadge(category: EventCategory) {
  const labels: Record<EventCategory, string> = {
    login: 'Login',
    security: 'Segurança',
    settings: 'Configurações',
    other: 'Outro'
  };
  return labels[category];
}

export function ProfileActivityTab({ token }: { token: string }) {
  const eventsQuery = useQuery({
    queryKey: ['security-events'],
    queryFn: () => listSecurityEvents(token)
  });
  const events = eventsQuery.data?.items ?? [];
  const [filter, setFilter] = useState<(typeof filters)[number]['id']>('all');

  const filtered = useMemo(
    () => events.filter((event) => filter === 'all' || eventMeta(event.event_type).category === filter),
    [events, filter]
  );
  const groups = groupEventsByDay(filtered);
  const logins = events.filter((event) => event.event_type.startsWith('login.'));
  const failed = logins.filter((event) => event.outcome !== 'success').length;
  const uniqueIps = new Set(logins.map((event) => event.ip_address).filter(Boolean)).size;
  const dayCount = new Set(filtered.map((event) => new Date(event.occurred_at).toDateString())).size;

  function exportLog(rows: ApiSecurityEvent[], name: string) {
    downloadCsv(name, [
      ['Data', 'Evento', 'Resultado', 'IP', 'Navegador', 'Sistema'],
      ...rows.map((event) => {
        const parsed = parseUserAgent(event.user_agent);
        return [
          formatDateTime(event.occurred_at),
          eventMeta(event.event_type).title,
          event.outcome,
          event.ip_address ?? '',
          parsed.browser,
          parsed.os
        ];
      })
    ]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Registro de atividade</CardTitle>
              <CardDescription>
                {filtered.length} evento{filtered.length === 1 ? '' : 's'}
                {dayCount ? ` em ${dayCount} dia${dayCount === 1 ? '' : 's'}` : ''}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filtered.length === 0}
              onClick={() => exportLog(filtered, 'atividade-conta.csv')}
            >
              <DownloadIcon />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <TabsList>
              {filters.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {groups.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhuma atividade recente nesta categoria.</p>
          )}

          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-3">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{group.label}</h3>
              <ol className="flex flex-col gap-3">
                {group.items.map((event) => {
                  const meta = eventMeta(event.event_type);
                  const parsed = parseUserAgent(event.user_agent);
                  return (
                    <li key={event.id} className="flex gap-3">
                      <div
                        className={cn(
                          'mt-1.5 size-2 shrink-0 rounded-full',
                          event.outcome !== 'success' || meta.severity === 'critical'
                            ? 'bg-destructive'
                            : meta.severity === 'warning'
                              ? 'bg-amber-500'
                              : 'bg-primary'
                        )}
                      />
                      <div className="min-w-0 flex-1 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{meta.title}</p>
                          <Badge variant="secondary">{categoryBadge(meta.category)}</Badge>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">{meta.description}</p>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {new Date(event.occurred_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {' · '}
                          {event.ip_address ?? 'IP desconhecido'}
                          {' · '}
                          {parsed.device}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Histórico de login</CardTitle>
              <CardDescription>Eventos de autenticação dos últimos registros.</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={logins.length === 0}
              onClick={() => exportLog(logins, 'historico-login.csv')}
            >
              <DownloadIcon />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Total" value={logins.length} />
            <Stat label="Falhas" value={failed} tone={failed > 0 ? 'danger' : undefined} />
            <Stat label="IPs distintos" value={uniqueIps} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data / hora</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Endereço IP</TableHead>
                <TableHead>Navegador / SO</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logins.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Nenhum login registrado.
                  </TableCell>
                </TableRow>
              )}
              {logins.map((event) => {
                const ok = event.outcome === 'success';
                const parsed = parseUserAgent(event.user_agent);
                return (
                  <TableRow key={event.id} className={cn(!ok && 'bg-destructive/5')}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(event.occurred_at)}</TableCell>
                    <TableCell>
                      <Badge variant={ok ? 'outline' : 'destructive'}>{ok ? 'Sucesso' : 'Falha'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{event.ip_address ?? '—'}</TableCell>
                    <TableCell>
                      {parsed.browser}
                      <span className="text-muted-foreground"> {parsed.os}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-muted-foreground text-xs">Exibindo {logins.length} evento{logins.length === 1 ? '' : 's'} de login.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('text-xl font-semibold tabular-nums', tone === 'danger' && 'text-destructive')}>{value}</p>
    </div>
  );
}
