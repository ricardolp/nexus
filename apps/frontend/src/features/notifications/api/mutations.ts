import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { markAllNotificationsRead, markNotificationRead } from './service';
import { notificationKeys } from './queries';

export const markNotificationReadMutation = mutationOptions({
  mutationFn: (notificationId: string) => markNotificationRead(notificationId),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: notificationKeys.all });
  },
});

export const markAllNotificationsReadMutation = mutationOptions({
  mutationFn: () => markAllNotificationsRead(),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: notificationKeys.all });
  },
});
