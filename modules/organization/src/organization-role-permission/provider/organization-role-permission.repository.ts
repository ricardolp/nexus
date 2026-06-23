import { Permission } from '@nexus/shared';
import { OrganizationRolePermission } from '../model';

export interface OrganizationRolePermissionRepository {
  create(data: OrganizationRolePermission): Promise<OrganizationRolePermission>;
  deleteByRoleId(roleId: string): Promise<void>;
  findByRoleId(roleId: string): Promise<OrganizationRolePermission[]>;
  replaceRolePermissions(
    roleId: string,
    permissions: Permission[],
  ): Promise<OrganizationRolePermission[]>;
}
