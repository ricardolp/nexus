import {
  Entity,
  EntityState,
  MaxLengthRule,
  MinLengthRule,
  RequiredRule,
  SlugRule,
  Validator,
} from '@nexus/shared';

export interface OrganizationState extends EntityState {
  nome: string;
  slug: string;
  logo?: string | null;
}

export class Organization extends Entity<OrganizationState> {
  constructor(props: OrganizationState) {
    super(props);
  }

  get nome(): string {
    return this.props.nome;
  }

  get slug(): string {
    return this.props.slug;
  }

  get logo(): string | null {
    return this.props.logo ?? null;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organization.nome',
        value: this.nome,
        rules: [
          new RequiredRule(),
          new MinLengthRule(2),
          new MaxLengthRule(120),
        ],
      },
      {
        code: 'organization.slug',
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
