'use client';

import { useSuspenseQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';
import { IconArrowLeft, IconFileText } from '@tabler/icons-react';
import { nfeOrganizationEventDetailQueryOptions } from '../api/queries';
import {
  EVENT_STATUS_BADGE_CLASS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  FLUXO_BADGE_CLASS,
} from '../constants/nfe-status-options';
import { formatDateTime } from '../lib/format';
import { nfeDocumentDetailPath, nfeEventsPath } from '../lib/paths';

type NfeEventDetailViewProps = {
  eventId: string;
};

export function NfeEventDetailView({ eventId }: NfeEventDetailViewProps) {
  const { activeOrganizationId, isLoading } = useAuth();

  if (isLoading || !activeOrganizationId) {
    return <NfeEventDetailSkeleton />;
  }

  return (
    <NfeEventDetailContent
      organizationId={activeOrganizationId}
      eventId={eventId}
    />
  );
}

function NfeEventDetailContent({
  organizationId,
  eventId,
}: {
  organizationId: string;
  eventId: string;
}) {
  const { data: event } = useSuspenseQuery(
    nfeOrganizationEventDetailQueryOptions(organizationId, eventId),
  );

  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const statusLabel =
    EVENT_STATUS_LABELS[event.eventStatus] ?? event.eventStatus;

  return (
    <div className='flex flex-col gap-6'>
      <div className='bg-card/40 flex flex-col gap-5 rounded-xl border p-5 shadow-sm md:p-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='flex min-w-0 flex-1 flex-col gap-4'>
            <Button variant='ghost' size='sm' className='-ml-2 w-fit' asChild>
              <Link href={nfeEventsPath()}>
                <IconArrowLeft className='mr-1 size-4' />
                Voltar
              </Link>
            </Button>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h1 className='text-xl font-semibold tracking-tight'>
                  {typeLabel}
                </h1>
                <Badge
                  variant='outline'
                  className={cn(
                    'border-0',
                    EVENT_STATUS_BADGE_CLASS[event.eventStatus],
                  )}
                >
                  {statusLabel}
                </Badge>
                <Badge
                  variant='outline'
                  className={cn(
                    'border-0 capitalize',
                    event.document.direction === 'inbound'
                      ? FLUXO_BADGE_CLASS.inbound
                      : FLUXO_BADGE_CLASS.outbound,
                  )}
                >
                  {event.document.direction}
                </Badge>
              </div>
              <p className='text-muted-foreground mt-2 text-sm'>
                Sequência {event.sequence} · NF-e nº {event.document.number}{' '}
                (série {event.document.series})
              </p>
            </div>
          </div>
          <Button variant='outline' size='sm' asChild>
            <Link href={nfeDocumentDetailPath(event.document.id)}>
              <IconFileText className='mr-1.5 size-4' />
              Ver NF-e
            </Link>
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2'>
        <DetailField label='Protocolo' value={event.protocol} mono />
        <DetailField
          label='Código SEFAZ'
          value={event.sefazStatusCode}
          mono
        />
        <DetailField
          label='Mensagem SEFAZ'
          value={event.sefazStatusMessage}
          className='md:col-span-2'
        />
        <DetailField
          label='Erro'
          value={
            event.errorCode || event.errorMessage
              ? [event.errorCode, event.errorMessage].filter(Boolean).join(' — ')
              : null
          }
          className='md:col-span-2'
        />
        <DetailField
          label='Início'
          value={event.startedAt ? formatDateTime(event.startedAt) : null}
        />
        <DetailField
          label='Conclusão'
          value={
            event.completedAt ? formatDateTime(event.completedAt) : null
          }
        />
        <DetailField
          label='Criado em'
          value={formatDateTime(event.createdAt)}
        />
        <DetailField
          label='Chave de acesso'
          value={event.document.accessKey}
          mono
        />
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border px-4 py-3', className)}>
      <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
        {label}
      </p>
      <p
        className={cn(
          'mt-1 text-sm break-all',
          mono && 'font-mono text-xs',
          !value && 'text-muted-foreground',
        )}
      >
        {value || '—'}
      </p>
    </div>
  );
}

export function NfeEventDetailSkeleton() {
  return (
    <div className='flex animate-pulse flex-col gap-6'>
      <div className='bg-muted h-40 rounded-xl' />
      <div className='grid gap-4 md:grid-cols-2'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='bg-muted h-20 rounded-lg' />
        ))}
      </div>
    </div>
  );
}
