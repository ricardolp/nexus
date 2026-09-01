import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Pie, PieChart, XAxis } from 'recharts';
import {
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  ArrowRightIcon,
  ArrowUpFromLineIcon,
  BadgeCheckIcon,
  BellIcon,
  FileTextIcon,
  type LucideIcon
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import {
  getUnreadNotificationCount,
  listFiscalDocuments,
  listNotifications,
  listPendingFiscalDocuments,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/endpoints';
import type { ApiFiscalDocument, ApiNotification, ApiPendingFiscalDocument } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDateTime, formatRelativeTime } from '@/pages/app/fiscal/format';
import {
  badgeFor,
  documentListBucket,
  pendingDocumentStatusLabels,
  statusLabels
} from '@/pages/app/fiscal/status-labels';

const VOLUME_DAYS = 14;

const volumeChartConfig = {
  inbound: { label: 'Entrada', color: 'var(--chart-1)' }
} satisfies ChartConfig;

const statusChartConfig = {
  count: { label: 'Notas' },
  action_needed: { label: 'Precisa de ação', color: 'var(--chart-4)' },
  in_progress: { label: 'Em andamento', color: 'var(--chart-2)' },
  completed: { label: 'Concluídas', color: 'var(--chart-1)' },
  problem: { label: 'Com problema', color: 'var(--chart-5)' }
} satisfies ChartConfig;

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function lastNDays(n: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (n - 1 - i));
    return {
      key: dayKey(date),
      label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    };
  });
}

function documentTitle(doc: ApiFiscalDocument) {
  if (doc.issuer_name) return doc.issuer_name;
  if (doc.number) return `NF-e ${doc.number}${doc.series ? `/${doc.series}` : ''}`;
  return doc.access_key ?? 'Documento';
}

function documentSubtitle(doc: ApiFiscalDocument) {
  const number = doc.number ? `nº ${doc.number}${doc.series ? `/${doc.series}` : ''}` : null;
  return [number, formatRelativeTime(doc.received_at)].filter(Boolean).join(' · ');
}

function pendingTitle(doc: ApiPendingFiscalDocument) {
  return doc.nome_emitente || 'Emitente não informado';
}

export default function OverviewPage() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const enabled = !!token && !!organizationId;

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => getUnreadNotificationCount(token!),
    enabled: !!token
  });

  const notificationsQuery = useQuery({
    queryKey: ['notifications-list', { unread: true }],
    queryFn: () => listNotifications(token!, true, 12),
    enabled: !!token
  });

  const inboundQuery = useQuery({
    queryKey: ['fiscal-documents', organizationId, 'nfe'],
    queryFn: () => listFiscalDocuments(token!, organizationId!, { documentType: 'nfe', limit: 200 }),
    enabled
  });

  const pendingQuery = useQuery({
    queryKey: ['fiscal-documents-pending', organizationId],
    queryFn: () => listPendingFiscalDocuments(token!, organizationId!, 200),
    enabled
  });

  const inbound = inboundQuery.data?.items ?? [];
  const pending = pendingQuery.data?.items ?? [];
  const unreadNotifications = notificationsQuery.data?.items ?? [];
  const unreadCount = unreadQuery.data?.unread_count ?? 0;

  const awaitingScience = useMemo(
    () => pending.filter((doc) => doc.status === 'pending' || doc.status === 'error'),
    [pending]
  );

  const actionNeededCount = useMemo(
    () => inbound.filter((doc) => documentListBucket(doc.status) === 'action_needed').length,
    [inbound]
  );

  const volumeData = useMemo(() => {
    const days = lastNDays(VOLUME_DAYS);
    const counts = new Map(days.map((day) => [day.key, 0]));
    for (const doc of inbound) {
      const key = dayKey(new Date(doc.received_at));
      if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return days.map((day) => ({ day: day.label, inbound: counts.get(day.key) ?? 0 }));
  }, [inbound]);

  const hasVolume = volumeData.some((row) => row.inbound > 0);

  const statusChartData = useMemo(() => {
    const counts = { action_needed: 0, in_progress: 0, completed: 0, problem: 0 };
    for (const doc of inbound) {
      counts[documentListBucket(doc.status)]++;
    }
    return (Object.keys(counts) as Array<keyof typeof counts>)
      .map((key) => ({
        status: key,
        count: counts[key],
        fill: `var(--color-${key})`
      }))
      .filter((row) => row.count > 0);
  }, [inbound]);

  const invalidateNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(token!, id),
    onSuccess: invalidateNotifications
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(token!),
    onSuccess: invalidateNotifications
  });

  if (!organizationId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Visão geral</CardTitle>
          <CardDescription>
            Sua conta ainda não está vinculada a uma organização. Notas, Ciência da Operação e gráficos
            aparecem depois do vínculo.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const fiscalError = inboundQuery.error ?? pendingQuery.error;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {fiscalError && (
        <p className="text-destructive text-sm">
          {fiscalError instanceof ApiError
            ? fiscalError.message
            : 'Não foi possível carregar os documentos da visão geral.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <KpiCard
          to="/app/overview#notificacoes"
          icon={BellIcon}
          label="Não lidas"
          value={unreadCount}
          hint="Notificações aguardando leitura"
          loading={unreadQuery.isLoading}
          emphasize={unreadCount > 0}
        />
        <KpiCard
          to="/app/nfe"
          icon={ArrowDownToLineIcon}
          label="NF-e entrada"
          value={inbound.length}
          hint="Notas recebidas na organização"
          loading={inboundQuery.isLoading}
        />
        <KpiCard
          to="/app/nfe/saida"
          icon={ArrowUpFromLineIcon}
          label="NF-e saída"
          value={0}
          hint="Emissão ainda não disponível"
          loading={false}
        />
        <KpiCard
          to="/app/nfe"
          icon={BadgeCheckIcon}
          label="Aguardando Ciência"
          value={awaitingScience.length}
          hint="Resumos SEFAZ sem XML completo"
          loading={pendingQuery.isLoading}
          emphasize={awaitingScience.length > 0}
        />
        <KpiCard
          to="/app/nfe"
          icon={AlertTriangleIcon}
          label="Precisa de ação"
          value={actionNeededCount}
          hint="Entrada bloqueada ou incompleta"
          loading={inboundQuery.isLoading}
          emphasize={actionNeededCount > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Volume de entrada</CardTitle>
            <CardDescription>Quantidade de NF-e recebidas nos últimos {VOLUME_DAYS} dias</CardDescription>
          </CardHeader>
          <CardContent>
            {inboundQuery.isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : !hasVolume ? (
              <EmptyChart message="Nenhuma nota de entrada nos últimos 14 dias." />
            ) : (
              <ChartContainer config={volumeChartConfig} className="aspect-auto h-[280px] w-full">
                <AreaChart data={volumeData}>
                  <defs>
                    <linearGradient id="fillInbound" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-inbound)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-inbound)" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Area dataKey="inbound" type="monotone" fill="url(#fillInbound)" stroke="var(--color-inbound)" />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Situação da entrada</CardTitle>
            <CardDescription>Distribuição das notas pelo andamento do processo</CardDescription>
          </CardHeader>
          <CardContent>
            {inboundQuery.isLoading ? (
              <Skeleton className="mx-auto h-[280px] w-[280px] rounded-full" />
            ) : statusChartData.length === 0 ? (
              <EmptyChart message="Ainda não há notas de entrada para classificar." />
            ) : (
              <ChartContainer config={statusChartConfig} className="mx-auto aspect-square h-[280px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
                  <Pie data={statusChartData} dataKey="count" nameKey="status" innerRadius={58} strokeWidth={4} />
                  <ChartLegend content={<ChartLegendContent nameKey="status" />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card id="notificacoes" className={cn('scroll-mt-20', unreadCount > 0 && 'border-amber-500/30')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BellIcon className="size-4" />
              Notificações não lidas
            </CardTitle>
            <CardDescription>
              {unreadCount === 0 ? 'Tudo em dia.' : `${unreadCount} aguardando leitura`}
            </CardDescription>
            {unreadCount > 0 && (
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 text-xs"
                  disabled={markAllReadMutation.isPending}
                  onClick={() => markAllReadMutation.mutate()}
                >
                  Marcar todas
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {notificationsQuery.isLoading ? (
              <ListSkeleton />
            ) : unreadNotifications.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma notificação pendente.</p>
            ) : (
              <ul className="flex flex-col">
                {unreadNotifications.map((notification) => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onRead={() => markReadMutation.mutate(notification.id)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownToLineIcon className="size-4" />
              Entrada recente
            </CardTitle>
            <CardDescription>Últimas NF-e recebidas</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-auto px-0 text-xs" asChild>
                <Link to="/app/nfe">
                  Ver todas <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {inboundQuery.isLoading ? (
              <ListSkeleton />
            ) : inbound.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma nota de entrada recebida ainda.</p>
            ) : (
              <ul className="flex flex-col">
                {inbound.slice(0, 8).map((doc) => (
                  <DocumentRow key={doc.id} document={doc} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheckIcon className="size-4" />
              Aguardando Ciência
            </CardTitle>
            <CardDescription>Notas resumidas na SEFAZ, sem XML completo</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" className="h-auto px-0 text-xs" asChild>
                <Link to="/app/nfe">
                  Tratar <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {pendingQuery.isLoading ? (
              <ListSkeleton />
            ) : awaitingScience.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma nota aguardando Ciência da Operação.</p>
            ) : (
              <ul className="flex flex-col">
                {awaitingScience.slice(0, 8).map((doc) => (
                  <PendingRow key={doc.id} document={doc} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  to,
  icon: Icon,
  label,
  value,
  hint,
  loading,
  emphasize
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
  loading: boolean;
  emphasize?: boolean;
}) {
  return (
    <Link to={to} className="block">
      <Card
        className={cn(
          'h-full transition-colors hover:bg-accent/40',
          emphasize && 'border-amber-500/40 bg-amber-500/5'
        )}
      >
        <CardHeader>
          <CardDescription className="flex items-center gap-1.5">
            <Icon className="size-3.5" />
            {label}
          </CardDescription>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <CardTitle className="text-2xl font-semibold tabular-nums">{value.toLocaleString('pt-BR')}</CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">{hint}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function NotificationRow({
  notification,
  onRead
}: {
  notification: ApiNotification;
  onRead: () => void;
}) {
  return (
    <li className="border-border/60 border-b last:border-b-0">
      <button type="button" className="hover:bg-accent/50 flex w-full flex-col gap-1 py-3 text-left" onClick={onRead}>
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium">{notification.title}</span>
          <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
        </div>
        {notification.body && <p className="text-muted-foreground line-clamp-2 text-xs">{notification.body}</p>}
        <span className="text-muted-foreground text-[11px]">{formatRelativeTime(notification.created_at)}</span>
      </button>
    </li>
  );
}

function DocumentRow({ document }: { document: ApiFiscalDocument }) {
  const status = badgeFor(statusLabels, document.status);
  return (
    <li className="border-border/60 border-b last:border-b-0">
      <Link to={`/app/nfe/${document.id}`} className="hover:bg-accent/50 flex items-start gap-3 py-3">
        <FileTextIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium">{documentTitle(document)}</p>
          <p className="text-muted-foreground truncate text-xs">{documentSubtitle(document)}</p>
        </div>
        <Badge variant="outline" className={cn('shrink-0 gap-1.5 font-normal', status.className)}>
          <span className={cn('size-1.5 rounded-full', status.dot)} />
          {status.label}
        </Badge>
      </Link>
    </li>
  );
}

function PendingRow({ document }: { document: ApiPendingFiscalDocument }) {
  const status = badgeFor(pendingDocumentStatusLabels, document.status);
  return (
    <li className="border-border/60 flex items-start gap-3 border-b py-3 last:border-b-0">
      <BadgeCheckIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{pendingTitle(document)}</p>
        <p className="text-muted-foreground truncate font-mono text-[11px]" title={document.chave}>
          {document.chave}
        </p>
        <p className="text-muted-foreground text-xs">{formatDateTime(document.data_emissao)}</p>
      </div>
      <Badge variant="outline" className={cn('shrink-0 gap-1.5 font-normal', status.className)}>
        <span className={cn('size-1.5 rounded-full', status.dot)} />
        {status.label}
      </Badge>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center">
      <p className="text-muted-foreground max-w-xs text-center text-sm">{message}</p>
    </div>
  );
}
