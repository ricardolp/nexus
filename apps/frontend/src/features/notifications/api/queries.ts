import { queryOptions } from '@tanstack/react-query';
import { listNotifications } from './service';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (params?: { unreadOnly?: boolean; limit?: number; offset?: number }) =>
    [...notificationKeys.all, 'list', params ?? {}] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

export const notificationsQueryOptions = (params?: {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) =>
  queryOptions({
    queryKey: notificationKeys.list(params),
    queryFn: () => listNotifications(params),
  });
