import { Injectable } from '@nestjs/common';
import {
  OrganizationRolePermission,
  OrganizationRolePermissionRepository,
} from '@nexus/organization';
import { Permission } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationRolePermissionRepository
  implements OrganizationRolePermissionRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: OrganizationRolePermission,
  ): Promise<OrganizationRolePermission> {
    const record = await this.prisma.organizationRolePermission.create({
      data: {
        id: data.id,
        role_id: data.roleId,
        permission: data.permission,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        deleted_at: data.deletedAt ?? null,
      },
    });

    return this.toDomain(record);
  }

  async deleteByRoleId(roleId: string): Promise<void> {
    await this.prisma.organizationRolePermission.updateMany({
      where: { role_id: roleId, deleted_at: null },
      data: { deleted_at: new Date() },
    });
  }

  async findByRoleId(roleId: string): Promise<OrganizationRolePermission[]> {
    const records = await this.prisma.organizationRolePermission.findMany({
      where: { role_id: roleId, deleted_at: null },
    });

    return records.map((record) => this.toDomain(record));
  }

  async replaceRolePermissions(
    roleId: string,
    permissions: Permission[],
  ): Promise<OrganizationRolePermission[]> {
    await this.deleteByRoleId(roleId);

    const created: OrganizationRolePermission[] = [];

    for (const permission of permissions) {
      const entity = new OrganizationRolePermission({
        roleId,
        permission,
      });

      entity.validate();
      created.push(await this.create(entity));
    }

    return created;
  }

  private toDomain(record: {
    id: string;
    role_id: string;
    permission: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): OrganizationRolePermission {
    return new OrganizationRolePermission({
      id: record.id,
      roleId: record.role_id,
      permission: record.permission as Permission,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
