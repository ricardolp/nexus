export const USER_ROLES = ['member', 'admin'] as const;

export type UserRole = (typeof USER_ROLES)[number];
