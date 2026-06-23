import {
  Entity,
  EntityState,
  MaxLengthRule,
  MinLengthRule,
  RequiredRule,
  SlugRule,
  Validator,
} from '@nexus/shared';

export interface OrganizationRoleState extends EntityState {
  organizationId: string;
  nome: string;
  slug: string;
}

export class OrganizationRole extends Entity<OrganizationRoleState> {
  constructor(props: OrganizationRoleState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get nome(): string {
    return this.props.nome;
  }

  get slug(): string {
    return this.props.slug;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationRole.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationRole.nome',
        value: this.nome,
        rules: [
          new RequiredRule(),
          new MinLengthRule(2),
          new MaxLengthRule(80),
        ],
      },
      {
        code: 'organizationRole.slug',
        value: this.slug,
        rules: [
          new RequiredRule(),
          new SlugRule(),
          new MinLengthRule(2),
          new MaxLengthRule(80),
        ],
      },
    ]);
  }
}
