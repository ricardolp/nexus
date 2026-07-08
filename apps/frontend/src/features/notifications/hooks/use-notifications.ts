'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { mapApiNotification } from '../api/map-notification';
import {
  markAllNotificationsReadMutation,
  markNotificationReadMutation,
} from '../api/mutations';
import { notificationsQueryOptions } from '../api/queries';
import type { AppNotification } from '../api/map-notification';
import { getUnreadNotificationsCount } from '../api/service';
import { notificationKeys } from '../api/queries';

export function useNotifications(limit = 50) {
  const query = useQuery({
    ...notificationsQueryOptions({ limit }),
    select: (data) => data.notifications.map(mapApiNotification),
  });

  const unreadCountQuery = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadNotificationsCount,
  });

  const markAsReadMutation = useMutation(markNotificationReadMutation);
  const markAllAsReadMutation = useMutation(markAllNotificationsReadMutation);

  const notifications: AppNotification[] = query.data ?? [];
  const unreadCount = unreadCountQuery.data ?? notifications.filter((item) => item.status === 'unread').length;

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    markAsRead: (id: string) => markAsReadMutation.mutate(id),
    markAllAsRead: () => markAllAsReadMutation.mutate(),
  };
}
