import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HistoryIcon } from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  listMemberAuditEvents,
  listMemberSecurityEvents,
  listUserAuditEvents,
  listUserSecurityEvents
} from '@/lib/endpoints';
import type { ApiSecurityEvent } from '@/lib/api-types';
import { formatDateTime } from '@/pages/app/fiscal/format';
import { eventMeta, parseUserAgent } from '@/pages/profile/helpers';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

export type UserHistoryTarget = {
  email: string;
  lastLoginAt?: string | null;
} & (
  | { kind: 'platform'; userId: string }
  | { kind: 'member'; organizationId: string; memberId: string }
);

const auditLabels: Record<string, string> = {
  'user.invite': 'Convite enviado',
  'user.invite.resend': 'Convite reenviado',
  'user.invitation.accept': 'Convite aceito',
  'user.soft_delete': 'Usuário eliminado',
  'member.add': 'Membro adicionado',
  'member.remove': 'Membro removido',
  'member.suspend': 'Membro bloqueado',
  'member.reactivate': 'Membro reativado',
  'member.role.assign': 'Perfil atribuído',
  'member.role.remove': 'Perfil removido',
  'organization.create': 'Organização criada',
  'organization.update': 'Organização atualizada',
  'organization.auth_settings.update': 'Configuração de autenticação alterada',
  'role.create': 'Perfil criado',
  'role.update': 'Perfil atualizado',
  'role.delete': 'Perfil removido'
};

function auditTitle(action: string) {
  return auditLabels[action] ?? action.replaceAll('.', ' · ');
}

interface UserHistorySheetProps {
  token: string;
  target: UserHistoryTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserHistorySheet({ token, target, open, onOpenChange }: UserHistorySheetProps) {
  const enabled = open && !!target;

  const securityQuery = useQuery({
    queryKey: ['user-history-security', target],
    queryFn: () => {
      if (!target) throw new Error('missing target');
      return target.kind === 'platform'
        ? listUserSecurityEvents(token, target.userId)
        : listMemberSecurityEvents(token, target.organizationId, target.memberId);
    },
    enabled
  });

  const auditQuery = useQuery({
    queryKey: ['user-history-audit', target],
    queryFn: () => {
      if (!target) throw new Error('missing target');
      return target.kind === 'platform'
        ? listUserAuditEvents(token, target.userId)
        : listMemberAuditEvents(token, target.organizationId, target.memberId);
    },
    enabled
  });

  const securityEvents = securityQuery.data?.items ?? [];
  const auditEvents = auditQuery.data?.items ?? [];
  const logins = useMemo(
    () => securityEvents.filter((event) => event.event_type.startsWith('login.')),
    [securityEvents]
  );
  const otherSecurity = useMemo(
    () => securityEvents.filter((event) => !event.event_type.startsWith('login.')),
    [securityEvents]
  );

  const activity = useMemo(() => {
    const rows: Array<{ id: string; at: string; title: string; detail: string; tone: 'ok' | 'warn' | 'danger' }> = [
      ...otherSecurity.map((event) => {
        const meta = eventMeta(event.event_type);
        return {
          id: `sec-${event.id}`,
          at: event.occurred_at,
          title: meta.title,
          detail: [event.ip_address, parseUserAgent(event.user_agent).device].filter(Boolean).join(' · '),
          tone: (event.outcome !== 'success' || meta.severity === 'critical'
            ? 'danger'
            : meta.severity === 'warning'
              ? 'warn'
              : 'ok') as 'ok' | 'warn' | 'danger'
        };
      }),
      ...auditEvents.map((event) => ({
        id: `aud-${event.id}`,
        at: event.occurred_at,
        title: auditTitle(event.action),
        detail: [event.resource_type, event.ip_address].filter(Boolean).join(' · '),
        tone: 'ok' as const
      }))
    ];
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [otherSecurity, auditEvents]);

  const loading = securityQuery.isLoading || auditQuery.isLoading;
  const error = securityQuery.error ?? auditQuery.error;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="size-4" />
            Histórico do usuário
          </SheetTitle>
          <SheetDescription>
            {target?.email}
            {target?.lastLoginAt ? ` · último login ${formatDateTime(target.lastLoginAt)}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando histórico...</p>
          ) : error ? (
            <p className="text-destructive text-sm">
              {error instanceof ApiError ? error.message : 'Não foi possível carregar o histórico.'}
            </p>
          ) : (
            <Tabs defaultValue="login">
              <TabsList>
                <TabsTrigger value="login">Login ({logins.length})</TabsTrigger>
                <TabsTrigger value="activity">Atividade ({activity.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <LoginHistoryTable events={logins} />
              </TabsContent>
              <TabsContent value="activity">
                {activity.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhuma atividade administrativa registrada.</p>
                ) : (
                  <ol className="flex flex-col gap-3">
                    {activity.map((item) => (
                      <li key={item.id} className="flex gap-3">
                        <div
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            item.tone === 'danger'
                              ? 'bg-destructive'
                              : item.tone === 'warn'
                                ? 'bg-amber-500'
                                : 'bg-primary'
                          )}
                        />
                        <div className="min-w-0 flex-1 rounded-lg border p-3">
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {formatDateTime(item.at)}
                            {item.detail ? ` · ${item.detail}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LoginHistoryTable({ events }: { events: ApiSecurityEvent[] }) {
  const failed = events.filter((event) => event.outcome !== 'success').length;
  const uniqueIps = new Set(events.map((event) => event.ip_address).filter(Boolean)).size;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total" value={events.length} />
        <Stat label="Falhas" value={failed} tone={failed > 0 ? 'danger' : undefined} />
        <Stat label="IPs distintos" value={uniqueIps} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data / hora</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Navegador / SO</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground">
                Nenhum login registrado.
              </TableCell>
            </TableRow>
          )}
          {events.map((event) => {
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
