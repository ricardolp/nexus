import { PrismaClient } from '@prisma/client';

const INTEGRATION_PERMISSIONS = [
  'organization:integration:read',
  'organization:integration:update',
  'integration:tokens:manage',
  'integration:webhooks:manage',
] as const;

export async function seedOrganizationIntegrationPermissions(
  prisma: PrismaClient,
): Promise<void> {
  const tiRoles = await prisma.organizationRole.findMany({
    where: { slug: 'ti', deleted_at: null },
    select: { id: true },
  });

  for (const role of tiRoles) {
    for (const permission of INTEGRATION_PERMISSIONS) {
      await prisma.organizationRolePermission.upsert({
        where: {
          role_id_permission: {
            role_id: role.id,
            permission,
          },
        },
        create: {
          role_id: role.id,
          permission,
        },
        update: {},
      });
    }
  }
}
