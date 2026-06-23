import {
  ALL_ORG_ROLE_PERMISSIONS,
  Entity,
  EntityState,
  InRule,
  Permission,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface OrganizationRolePermissionState extends EntityState {
  roleId: string;
  permission: Permission;
}

export class OrganizationRolePermission extends Entity<OrganizationRolePermissionState> {
  constructor(props: OrganizationRolePermissionState) {
    super(props);
  }

  get roleId(): string {
    return this.props.roleId;
  }

  get permission(): Permission {
    return this.props.permission;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationRolePermission.roleId',
        value: this.roleId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationRolePermission.permission',
        value: this.permission,
        rules: [new RequiredRule(), new InRule([...ALL_ORG_ROLE_PERMISSIONS])],
      },
    ]);
  }
}
