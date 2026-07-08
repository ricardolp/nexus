import type { NotificationAction, NotificationStatus } from '@/components/ui/notification-card';
import type { ApiNotificationAction, ApiUserNotification } from './types';

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: string;
  actions: NotificationAction[];
  navigatePath?: string;
};

function buildEntityPath(action: Extract<ApiNotificationAction, { kind: 'entity' }>): string | undefined {
  const { entity, organizationId, companyId, certificateId } = action;

  if (entity === 'certificate' && organizationId && companyId) {
    return `/dashboard/organization/${organizationId}/companies/${companyId}/certificates`;
  }

  if (entity === 'company' && organizationId && companyId) {
    return `/dashboard/organization/${organizationId}/companies/${companyId}`;
  }

  if (entity === 'organization' && organizationId) {
    return `/dashboard/organization/${organizationId}`;
  }

  if (entity === 'nfe-document' && organizationId && action.documentId) {
    return `/dashboard/organization/${organizationId}/documents/nfe/${action.documentId}`;
  }

  if (certificateId && organizationId && companyId) {
    return `/dashboard/organization/${organizationId}/companies/${companyId}/certificates`;
  }

  return undefined;
}

function mapAction(action: ApiNotificationAction | null): Pick<AppNotification, 'actions' | 'navigatePath'> {
  if (!action) {
    return { actions: [] };
  }

  if (action.kind === 'navigate') {
    return {
      navigatePath: action.path,
      actions: [
        {
          id: action.path,
          label: 'Ver',
          type: 'redirect',
          style: 'primary',
        },
      ],
    };
  }

  const path = buildEntityPath(action);

  if (!path) {
    return { actions: [] };
  }

  return {
    navigatePath: path,
    actions: [
      {
        id: path,
        label: 'Abrir',
        type: 'redirect',
        style: 'primary',
      },
    ],
  };
}

export function mapApiNotification(notification: ApiUserNotification): AppNotification {
  const { actions, navigatePath } = mapAction(notification.action);

  return {
    id: notification.id,
    title: notification.title,
    body: notification.description,
    status: notification.readAt ? 'read' : 'unread',
    createdAt: notification.createdAt,
    actions,
    navigatePath,
  };
}
