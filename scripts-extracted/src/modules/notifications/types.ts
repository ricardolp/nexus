export type NotificationAction =
  | { kind: "navigate"; path: string }
  | {
      kind: "entity";
      entity: string;
      organizationId?: string;
      companyId?: string;
      certificateId?: string;
      [key: string]: string | undefined;
    };
