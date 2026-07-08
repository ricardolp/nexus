import type {
  NotificationsListResponse,
  UnreadCountResponse,
} from './types';

type ListNotificationsParams = {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
};

export async function listNotifications(
  params: ListNotificationsParams = {},
): Promise<NotificationsListResponse> {
  const searchParams = new URLSearchParams();

  if (params.unreadOnly) {
    searchParams.set('unreadOnly', 'true');
  }

  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit));
  }

  if (params.offset !== undefined) {
    searchParams.set('offset', String(params.offset));
  }

  const query = searchParams.toString();
  const response = await fetch(
    `/api/backend/me/notifications${query ? `?${query}` : ''}`,
  );

  if (!response.ok) {
    throw new Error('Falha ao carregar notificações');
  }

  return response.json() as Promise<NotificationsListResponse>;
}

export async function getUnreadNotificationsCount(): Promise<number> {
  const response = await fetch('/api/backend/me/notifications/unread-count');

  if (!response.ok) {
    throw new Error('Falha ao carregar contagem de notificações');
  }

  const data = (await response.json()) as UnreadCountResponse;
  return data.count;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const response = await fetch(
    `/api/backend/me/notifications/${notificationId}/read`,
    { method: 'PATCH' },
  );

  if (!response.ok) {
    throw new Error('Falha ao marcar notificação como lida');
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await fetch('/api/backend/me/notifications/read-all', {
    method: 'PATCH',
  });

  if (!response.ok) {
    throw new Error('Falha ao marcar todas as notificações como lidas');
  }
}
