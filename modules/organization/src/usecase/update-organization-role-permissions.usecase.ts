import { NotFoundError, Permission, UseCase } from '@nexus/shared';
import { OrganizationRolePermission } from '../organization-role-permission/model';
import { OrganizationRolePermissionRepository } from '../organization-role-permission/provider';
import { OrganizationRoleRepository } from '../organization-role/provider';

export interface UpdateOrganizationRolePermissionsIn {
  organizationId: string;
  roleId: string;
  permissions: Permission[];
}

export class UpdateOrganizationRolePermissions
  implements UseCase<UpdateOrganizationRolePermissionsIn, OrganizationRolePermission[]>
{
  constructor(
    private readonly organizationRoleRepository: OrganizationRoleRepository,
    private readonly organizationRolePermissionRepository: OrganizationRolePermissionRepository,
  ) {}

  async execute(
    input: UpdateOrganizationRolePermissionsIn,
  ): Promise<OrganizationRolePermission[]> {
    const role = await this.organizationRoleRepository.findById(input.roleId);

    if (!role || role.organizationId !== input.organizationId) {
      throw new NotFoundError('Role não encontrada');
    }

    return this.organizationRolePermissionRepository.replaceRolePermissions(
      input.roleId,
      input.permissions,
    );
  }
}
