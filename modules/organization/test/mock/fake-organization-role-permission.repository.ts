import { Permission } from '@nexus/shared';
import { OrganizationRolePermission } from '../../src/organization-role-permission/model';
import { OrganizationRolePermissionRepository } from '../../src/organization-role-permission/provider';

export class FakeOrganizationRolePermissionRepository
  implements OrganizationRolePermissionRepository
{
  private readonly items = new Map<string, OrganizationRolePermission>();

  async create(
    data: OrganizationRolePermission,
  ): Promise<OrganizationRolePermission> {
    this.items.set(data.id, data);
    return data;
  }

  async deleteByRoleId(roleId: string): Promise<void> {
    for (const [id, item] of this.items.entries()) {
      if (item.roleId === roleId) {
        this.items.delete(id);
      }
    }
  }

  async findByRoleId(roleId: string): Promise<OrganizationRolePermission[]> {
    return Array.from(this.items.values()).filter(
      (item) => item.roleId === roleId,
    );
  }

  async replaceRolePermissions(
    roleId: string,
    permissions: Permission[],
  ): Promise<OrganizationRolePermission[]> {
    await this.deleteByRoleId(roleId);

    const created: OrganizationRolePermission[] = [];

    for (const permission of permissions) {
      const entity = new OrganizationRolePermission({ roleId, permission });
      created.push(await this.create(entity));
    }

    return created;
  }
}
