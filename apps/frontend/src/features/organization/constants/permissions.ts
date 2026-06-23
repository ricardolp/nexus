export const ORGANIZATION_ROLE_PERMISSIONS = [
  'organization:read',
  'organization:update',
  'organization:roles:read',
  'organization:roles:create',
  'organization:roles:update',
  'organization:roles:delete',
  'organization:members:read',
  'organization:members:create',
  'organization:members:update',
  'organization:members:delete',
  'organization:companies:read',
  'organization:companies:create',
  'organization:companies:update',
  'organization:companies:delete',
  'organization:companies:certificates:read',
  'organization:companies:certificates:create',
  'organization:companies:certificates:update',
  'organization:companies:certificates:delete',
  'organization:integration:read',
  'organization:integration:update',
  'integration:tokens:manage',
  'integration:webhooks:manage',
  'user:create',
  'user:read',
  'user:update',
  'user:delete',
] as const;

export type OrganizationRolePermission = (typeof ORGANIZATION_ROLE_PERMISSIONS)[number];

export const ORGANIZATION_ROLE_PERMISSION_OPTIONS = ORGANIZATION_ROLE_PERMISSIONS.map(
  (permission) => ({
    value: permission,
    label: permission,
  }),
);
