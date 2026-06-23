import { Entity, EntityState, RequiredRule, Validator } from '@nexus/shared';

export interface OrganizationMemberState extends EntityState {
  organizationId: string;
  userId: string;
  roleId: string;
}

export class OrganizationMember extends Entity<OrganizationMemberState> {
  constructor(props: OrganizationMemberState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get roleId(): string {
    return this.props.roleId;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationMember.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationMember.userId',
        value: this.userId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationMember.roleId',
        value: this.roleId,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
