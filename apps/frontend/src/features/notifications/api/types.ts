export type ApiNotificationAction =
  | { kind: 'navigate'; path: string }
  | {
      kind: 'entity';
      entity: string;
      organizationId?: string;
      companyId?: string;
      certificateId?: string;
      [key: string]: string | undefined;
    };

export type ApiUserNotification = {
  id: string;
  title: string;
  description: string;
  action: ApiNotificationAction | null;
  category: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsListResponse = {
  notifications: ApiUserNotification[];
};

export type UnreadCountResponse = {
  count: number;
};
