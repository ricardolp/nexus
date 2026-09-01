import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { listDocumentEvents } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { describeInboundEvent } from './event-descriptions';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

// Self-fetching timeline of organization_document_events, shared by the
// standalone events dialog and the "Integração" detail sheet's Linha do
// tempo tab — event_type/metadata_json are translated to PT-BR by
// describeInboundEvent (see docs/architecture/17_status_and_event_catalog.md
// for what each event carries).
export function DocumentTimeline({ documentId }: { documentId: string | null }) {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);

  const eventsQuery = useQuery({
    queryKey: ['document-events', organizationId, documentId],
    queryFn: () => listDocumentEvents(token!, organizationId!, documentId!),
    enabled: !!token && !!organizationId && !!documentId
  });

  const events = eventsQuery.data?.items ?? [];

  if (eventsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <p className="text-destructive text-sm">
        {eventsQuery.error instanceof ApiError ? eventsQuery.error.message : 'Não foi possível carregar os eventos.'}
      </p>
    );
  }

  if (events.length === 0) {
    return <p className="text-muted-foreground text-sm">Nenhum evento registrado para este documento.</p>;
  }

  return (
    <ScrollArea className="h-[50vh]">
      <ol className="flex flex-col gap-4 pr-4">
        {events.map((event) => {
          const described = describeInboundEvent(event);
          return (
            <li key={event.id} className="border-border relative border-l pl-4">
              <div className="bg-primary absolute top-1.5 -left-[3.5px] size-1.5 rounded-full" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{described.title}</span>
                {event.to_status && <Badge variant="outline">{event.to_status}</Badge>}
              </div>
              {described.description && <p className="text-sm">{described.description}</p>}
              <p className="text-muted-foreground text-xs">
                {formatDateTime(event.occurred_at)} · {event.actor_type}
                {event.actor_id ? ` (${event.actor_id})` : ''}
              </p>
            </li>
          );
        })}
      </ol>
    </ScrollArea>
  );
}
