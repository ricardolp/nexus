import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellIcon, DownloadIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api';
import {
  downloadFiscalDocument,
  downloadFiscalDocumentsZip,
  getFiscalDocumentQuery,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '@/lib/endpoints';
import type { ApiNotification } from '@/lib/api-types';
import { useAuthStore } from '@/store/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const POLL_INTERVAL_MS = 30_000;

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function NotificationBell() {
  const token = useAuthStore((s) => s.token);
  const organizationId = useAuthStore((s) => s.organizationId);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => getUnreadNotificationCount(token!),
    enabled: !!token,
    refetchInterval: POLL_INTERVAL_MS
  });

  const listQuery = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => listNotifications(token!, false, 20),
    enabled: !!token && open
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(token!, id),
    onSuccess: invalidate
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(token!),
    onSuccess: invalidate
  });

  const downloadMutation = useMutation({
    mutationFn: async (notification: ApiNotification) => {
      const data = notification.data as { query_request_id?: string } | undefined;
      if (!data?.query_request_id || !organizationId) return;
      const detail = await getFiscalDocumentQuery(token!, organizationId, data.query_request_id);
      const documentIds = (detail.items ?? [])
        .filter((item) => item.status === 'found' && item.document_id)
        .map((item) => item.document_id!);
      if (documentIds.length === 0) {
        toast.info('Nenhum documento encontrado nesta consulta para baixar.');
        return;
      }
      if (documentIds.length === 1) {
        await downloadFiscalDocument(token!, organizationId, documentIds[0]);
      } else {
        await downloadFiscalDocumentsZip(token!, organizationId, documentIds);
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível baixar os documentos.');
    }
  });

  const unreadCount = unreadQuery.data?.unread_count ?? 0;
  const notifications = listQuery.data?.items ?? [];

  function handleNotificationClick(notification: ApiNotification) {
    if (!notification.read_at) markReadMutation.mutate(notification.id);
    if (notification.type === 'fiscal.query_completed') {
      downloadMutation.mutate(notification);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full">
          <BellIcon />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notificações</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-medium">Notificações</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              disabled={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <Separator />
        <ScrollArea className="h-80">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground p-4 text-sm">Nenhuma notificação por aqui.</p>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleNotificationClick(n)}
                  className="hover:bg-accent flex flex-col gap-1 border-b px-4 py-3 text-left last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    {!n.read_at && <span className="bg-primary size-2 shrink-0 rounded-full" />}
                  </div>
                  {n.body && <p className="text-muted-foreground text-xs">{n.body}</p>}
                  <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                    <span>{formatDateTime(n.created_at)}</span>
                    {n.type === 'fiscal.query_completed' && (
                      <span className="flex items-center gap-1">
                        <DownloadIcon className="size-3" /> Baixar
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
