import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2Icon,
  CheckCircle2Icon,
  FileUpIcon,
  LandmarkIcon,
  Loader2Icon,
  AlertTriangleIcon,
  XCircleIcon
} from 'lucide-react';

import { getOrchestration, listDocumentEvents } from '@/lib/endpoints';
import type { ApiFiscalDocument } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { NexusMark } from '@/components/brand/nexus-mark';
import { cn } from '@/lib/utils';
import { formatHopTime, formatRelativeTime, isDocumentInFlight, sourceSystemLabel } from './format';
import {
  buildDocumentHopTrack,
  type DocumentHop,
  type HopActor,
  type HopAlertTone,
  type HopStatus
} from './document-stage-hops';
import { badgeFor, statusLabels } from './status-labels';

function ActorIcon({ actor, className }: { actor: HopActor; className?: string }) {
  if (actor === 'nexus') return <NexusMark size={18} className={className} />;
  if (actor === 'sap') return <Building2Icon className={className} />;
  if (actor === 'upload') return <FileUpIcon className={className} />;
  return <LandmarkIcon className={className} />;
}

function nodeTone(status: HopStatus) {
  if (status === 'done') return 'border-border bg-card text-foreground';
  if (status === 'current') return 'border-amber-500/60 bg-card text-amber-600 dark:text-amber-400';
  if (status === 'failed') return 'border-red-500/50 bg-card text-red-600 dark:text-red-400';
  return 'border-border/70 bg-card text-muted-foreground/35';
}

function HopNode({ hop }: { hop: DocumentHop }) {
  return (
    <div
      className={cn(
        'relative z-10 flex size-11 shrink-0 items-center justify-center rounded-lg border',
        nodeTone(hop.status)
      )}
      aria-hidden
    >
      {hop.status === 'current' ? (
        <Loader2Icon className="size-5 animate-spin" />
      ) : hop.status === 'failed' ? (
        <XCircleIcon className="size-5" />
      ) : (
        <ActorIcon actor={hop.actor} className="size-4" />
      )}
    </div>
  );
}

function alertClass(tone: HopAlertTone) {
  if (tone === 'danger') return 'border-red-500/35 bg-red-500/[0.04]';
  if (tone === 'warning') return 'border-amber-500/40 bg-amber-500/[0.05]';
  if (tone === 'success') return 'border-emerald-500/30 bg-emerald-500/[0.04]';
  return 'border-amber-500/35 bg-amber-500/[0.04]';
}

function alertIconClass(tone: HopAlertTone) {
  if (tone === 'danger') return 'text-red-600 dark:text-red-400';
  if (tone === 'success') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-amber-600 dark:text-amber-400';
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function DocumentStageTracker({
  document,
  companyName
}: {
  document: ApiFiscalDocument;
  companyName?: string;
}) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const inFlight = isDocumentInFlight(document.processing_status);
  const inbound = document.direction.toLowerCase() === 'inbound';

  const eventsQuery = useQuery({
    queryKey: ['document-events', organizationId, document.id],
    queryFn: () => listDocumentEvents(token!, organizationId!, document.id),
    enabled: !!token && !!organizationId,
    refetchInterval: inFlight ? 2000 : false
  });

  const orchestrationQuery = useQuery({
    queryKey: ['orchestration', organizationId, document.id],
    queryFn: () => getOrchestration(token!, organizationId!, document.id),
    enabled: !!token && !!organizationId && inbound,
    refetchInterval: inFlight ? 2000 : false
  });

  const events = eventsQuery.data?.items;
  const steps = orchestrationQuery.data?.steps ?? [];
  const currentPlanStep = [...steps]
    .sort((a, b) => a.sequence - b.sequence)
    .find(
      (step) =>
        step.status === 'READY' ||
        step.status === 'RUNNING' ||
        step.status === 'AWAITING_MANUAL' ||
        step.status === 'ACTION_REQUIRED' ||
        step.status === 'FAILED' ||
        step.status === 'BLOCKED'
    );
  const latestEvent = events?.at(-1);
  const scenarioMissing = latestEvent?.event_type === 'fiscal.inbound.scenario_not_found.v1';

  const track = useMemo(
    () =>
      buildDocumentHopTrack({
        document,
        events,
        currentPlanStep,
        templateCode: orchestrationQuery.data?.scenario?.scenario.process_template_code,
        scenarioMissing
      }),
    [document, events, currentPlanStep, orchestrationQuery.data?.scenario, scenarioMissing]
  );

  const alert = track.alert;
  const status = badgeFor(statusLabels, document.status);

  return (
    <section className="overflow-hidden rounded-xl border">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 px-5 py-4">
        <Meta label="Criado">{formatRelativeTime(document.created_at)}</Meta>
        <Meta label="Status">
          <Badge variant="outline" className={cn('gap-1.5 font-normal', status.className)}>
            <span className={cn('size-1.5 rounded-full', status.dot)} />
            {status.label}
          </Badge>
        </Meta>
        <Meta label="Processo">{track.processLabel}</Meta>
        <Meta label="Fonte">{sourceSystemLabel(document.source_system)}</Meta>
        {companyName && <Meta label="Empresa">{companyName}</Meta>}
      </div>

      {alert && (
        <div className="px-5 pb-3">
          <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', alertClass(alert.tone))}>
            {alert.tone === 'progress' ? (
              <Loader2Icon className={cn('mt-0.5 size-4 shrink-0 animate-spin', alertIconClass(alert.tone))} />
            ) : alert.tone === 'warning' ? (
              <AlertTriangleIcon className={cn('mt-0.5 size-4 shrink-0', alertIconClass(alert.tone))} />
            ) : alert.tone === 'success' ? (
              <CheckCircle2Icon className={cn('mt-0.5 size-4 shrink-0', alertIconClass(alert.tone))} />
            ) : (
              <XCircleIcon className={cn('mt-0.5 size-4 shrink-0', alertIconClass(alert.tone))} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{alert.title}</p>
              {alert.description && (
                <p
                  className={cn(
                    'mt-1 text-sm',
                    alert.tone === 'danger'
                      ? 'font-medium text-red-700 dark:text-red-400'
                      : 'text-muted-foreground'
                  )}
                >
                  {alert.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        className="px-4 pt-4 pb-5"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
          backgroundSize: '14px 14px'
        }}
      >
        <ol className="flex items-start overflow-x-auto pb-1" aria-label="Estágio da nota">
          {track.hops.map((item, index) => (
            <li key={item.id} className="flex min-w-0 flex-1 items-start">
              <div
                className={cn(
                  'flex w-full min-w-[6.5rem] flex-col items-center gap-2',
                  item.status === 'pending' && 'opacity-70'
                )}
                aria-current={item.status === 'current' ? 'step' : undefined}
              >
                <HopNode hop={item} />
                <span
                  className={cn(
                    'max-w-[9rem] rounded-full px-2 py-0.5 text-center text-[11px] leading-tight',
                    item.status === 'current' && 'font-medium text-amber-600 dark:text-amber-400',
                    item.status === 'failed' && 'font-medium text-red-600 dark:text-red-400',
                    item.status === 'done' && 'bg-muted text-foreground',
                    item.status === 'pending' && 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
                <span className="text-muted-foreground text-[11px]">{item.actorLabel}</span>
                <span className="text-muted-foreground/80 h-3.5 text-[10px] tabular-nums">
                  {item.status === 'done' || item.status === 'failed' ? formatHopTime(item.occurredAt) ?? '' : ''}
                </span>
              </div>
              {index < track.hops.length - 1 && (
                <div
                  className={cn(
                    'mt-[22px] h-px min-w-3 flex-1',
                    item.status === 'done' || (item.status === 'failed' && track.hops[index + 1]?.status !== 'pending')
                      ? 'bg-foreground/25'
                      : 'bg-border'
                  )}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
