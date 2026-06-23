'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  IconBox,
  IconCheck,
  IconClock,
  IconCurrencyDollar,
  IconFileText,
  IconLoader2,
  IconSearch,
  IconTruck,
  IconX,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { formatDateTime } from '../../../lib/format';
import {
  timelineEntriesForStep,
  type InboundFlowStep,
} from '../../../lib/build-inbound-steps';
import type { InboundStepVisualState } from '../../../constants/nfe-status-options';
import type {
  NfeDocumentEvent,
  NfeDocumentTimeline,
} from '../../../api/types';

const STEP_ICONS: Record<string, React.ReactNode> = {
  xml: <IconFileText className='size-4' />,
  sefaz: <IconCheck className='size-4' />,
  pedido: <IconSearch className='size-4' />,
  delivery: <IconTruck className='size-4' />,
  portaria: <IconClock className='size-4' />,
  migo: <IconBox className='size-4' />,
  miro: <IconCurrencyDollar className='size-4' />,
};

const STEP_CARD_STYLES: Record<InboundStepVisualState, string> = {
  done: 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500/80',
  error: 'border-red-500/50 bg-red-500/5 hover:border-red-500/80',
  warning: 'border-amber-500/50 bg-amber-500/5 hover:border-amber-500/80',
  current: 'border-primary/50 bg-primary/5 hover:border-primary/80',
  pending: 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/40',
};

const STEP_STATUS_ICON: Record<InboundStepVisualState, React.ReactNode> = {
  done: <IconCheck className='size-3.5 text-emerald-600' stroke={2.5} />,
  error: <IconX className='size-3.5 text-red-600' stroke={2.5} />,
  warning: <IconAlertTriangle className='size-3.5 text-amber-600' stroke={2.5} />,
  current: <IconLoader2 className='text-primary size-3.5 animate-spin' />,
  pending: null,
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  authorization: 'Autorização SEFAZ',
  xml_import: 'Importação XML',
  pedido_validation: 'Validação pedido',
  sap_delivery_create: 'Criação delivery SAP',
  sap_migo: 'Lançamento MIGO',
  sap_miro: 'Faturamento MIRO',
  inbound_status_change: 'Mudança de status',
  inbound_rejection: 'Rejeição inbound',
  portaria_confirmation: 'Confirmação portaria',
  cancellation: 'Cancelamento',
  correction_letter: 'Carta de correção',
};

function eventCardStyle(status: string): string {
  const normalized = status.toLowerCase();
  if (['accepted', 'sent'].includes(normalized)) {
    return 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500/80';
  }
  if (['rejected', 'error'].includes(normalized)) {
    return 'border-red-500/50 bg-red-500/5 hover:border-red-500/80';
  }
  if (normalized === 'pending') {
    return 'border-amber-500/50 bg-amber-500/5 hover:border-amber-500/80';
  }
  return 'border-muted-foreground/25 bg-muted/30 hover:border-muted-foreground/40';
}

function isEventSuccess(status: string): boolean {
  return ['accepted', 'sent'].includes(status.toLowerCase());
}

function isEventError(status: string): boolean {
  return ['rejected', 'error'].includes(status.toLowerCase());
}

type DetailEventsTabProps = {
  events: NfeDocumentEvent[];
  flowSteps?: InboundFlowStep[];
  timeline?: NfeDocumentTimeline[];
};

type LogDialogState = {
  title: string;
  entries: NfeDocumentTimeline[];
  executions: InboundFlowStep['flowExecutions'];
  eventDetails?: NfeDocumentEvent[];
};

export function DetailEventsTab({
  events,
  flowSteps = [],
  timeline = [],
}: DetailEventsTabProps) {
  const [logDialog, setLogDialog] = useState<LogDialogState | null>(null);

  const openStepLog = (step: InboundFlowStep) => {
    const entries = timelineEntriesForStep(step.key, timeline);
    const relatedEvents = events.filter((e) =>
      stepMatchesEvent(step.key, e.eventType),
    );
    setLogDialog({
      title: step.label,
      entries,
      executions: step.flowExecutions,
      eventDetails: relatedEvents,
    });
  };

  const openEventLog = (event: NfeDocumentEvent) => {
    setLogDialog({
      title: EVENT_TYPE_LABELS[event.eventType] ?? event.eventType,
      entries: [],
      executions: [],
      eventDetails: [event],
    });
  };

  const hasFlowSteps = flowSteps.length > 0;

  if (!hasFlowSteps && events.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        Nenhum evento registrado.
      </p>
    );
  }

  return (
    <>
      {hasFlowSteps && (
        <section className='space-y-3'>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            Etapas do processamento
          </p>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {flowSteps.map((step) => (
              <Card
                key={step.key}
                className={cn(
                  'flex flex-col gap-2 p-3 shadow-sm transition-colors',
                  STEP_CARD_STYLES[step.state],
                )}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md border',
                        step.state === 'done' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
                        step.state === 'error' && 'border-red-500/30 bg-red-500/10 text-red-700',
                        step.state === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-700',
                        step.state === 'current' && 'border-primary/30 bg-primary/10 text-primary',
                        step.state === 'pending' && 'border-muted bg-muted/50 text-muted-foreground',
                      )}
                    >
                      {STEP_ICONS[step.key] ?? <IconFileText className='size-4' />}
                    </span>
                    <div className='min-w-0'>
                      <p className='line-clamp-2 text-sm leading-snug font-medium'>
                        {step.label}
                      </p>
                      {step.completedAt && (
                        <p className='text-muted-foreground mt-0.5 text-xs'>
                          {formatDateTime(step.completedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  {STEP_STATUS_ICON[step.state]}
                </div>
                <div className='flex items-center justify-end'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2'
                    onClick={() => openStepLog(step)}
                  >
                    <IconFileText className='size-4' />
                    <span className='text-xs'>Log</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section className={cn('space-y-3', hasFlowSteps && 'mt-8')}>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            Eventos do documento
          </p>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {events.map((event) => (
              <Card
                key={event.id}
                className={cn(
                  'flex flex-col gap-2 p-3 shadow-sm transition-colors',
                  eventCardStyle(event.eventStatus),
                )}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0 flex-1'>
                    <p className='text-sm font-medium'>
                      {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                    </p>
                    <Badge variant='outline' className='mt-1 text-xs capitalize'>
                      {event.eventStatus}
                    </Badge>
                  </div>
                  {isEventSuccess(event.eventStatus) && (
                    <IconCheck className='size-4 shrink-0 text-emerald-600' />
                  )}
                  {isEventError(event.eventStatus) && (
                    <IconX className='size-4 shrink-0 text-red-600' />
                  )}
                </div>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-muted-foreground text-xs'>
                    {formatDateTime(event.completedAt ?? event.createdAt)}
                  </p>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2'
                    onClick={() => openEventLog(event)}
                  >
                    <IconFileText className='size-4' />
                    <span className='text-xs'>Log</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Dialog open={logDialog !== null} onOpenChange={(open) => !open && setLogDialog(null)}>
        <DialogContent className='max-h-[85vh] overflow-hidden sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>{logDialog?.title}</DialogTitle>
            <DialogDescription>Detalhes e histórico da etapa.</DialogDescription>
          </DialogHeader>
          <div className='max-h-[60vh] space-y-4 overflow-y-auto pr-1'>
            {logDialog?.executions && logDialog.executions.length > 0 && (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Execuções do fluxo
                </p>
                {logDialog.executions.map((exec) => (
                  <div
                    key={exec.id}
                    className='bg-muted/40 rounded-lg border px-3 py-2 text-sm'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='font-medium'>{exec.stepKey}</span>
                      <Badge variant='outline' className='text-xs'>
                        {exec.status}
                      </Badge>
                    </div>
                    {exec.message && (
                      <p className='text-muted-foreground mt-1 text-xs whitespace-pre-wrap'>
                        {exec.message}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {logDialog?.eventDetails && logDialog.eventDetails.length > 0 && (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Evento
                </p>
                {logDialog.eventDetails.map((event) => (
                  <div key={event.id} className='rounded-lg border px-3 py-2 text-sm'>
                    {event.sefazStatusMessage && <p>{event.sefazStatusMessage}</p>}
                    {event.errorMessage && (
                      <p className='text-destructive mt-1'>{event.errorMessage}</p>
                    )}
                    {event.protocol && (
                      <p className='text-muted-foreground mt-1 font-mono text-xs'>
                        Protocolo: {event.protocol}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {logDialog?.entries && logDialog.entries.length > 0 && (
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs font-semibold uppercase'>
                  Histórico
                </p>
                {logDialog.entries.map((entry) => (
                  <div key={entry.id} className='rounded-lg border px-3 py-2 text-sm'>
                    <p className='font-medium'>{entry.title}</p>
                    {entry.message && (
                      <p className='text-muted-foreground mt-1 text-xs whitespace-pre-wrap'>
                        {entry.message}
                      </p>
                    )}
                    <p className='text-muted-foreground mt-1 text-xs'>
                      {formatDateTime(entry.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {logDialog &&
              logDialog.entries.length === 0 &&
              logDialog.executions.length === 0 &&
              (!logDialog.eventDetails || logDialog.eventDetails.length === 0) && (
                <p className='text-muted-foreground py-4 text-center text-sm'>
                  Nenhum detalhe de log para esta etapa.
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function stepMatchesEvent(stepKey: string, eventType: string): boolean {
  const map: Record<string, string[]> = {
    xml: ['xml_import'],
    sefaz: ['authorization', 'status_query'],
    pedido: ['pedido_validation'],
    delivery: ['sap_delivery_create'],
    migo: ['sap_migo'],
    miro: ['sap_miro'],
    portaria: ['portaria_confirmation'],
  };
  return (map[stepKey] ?? []).includes(eventType);
}
