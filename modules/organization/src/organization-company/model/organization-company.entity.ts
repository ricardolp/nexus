import {
  CnpjRule,
  Entity,
  EntityState,
  InRule,
  MaxLengthRule,
  MinLengthRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import {
  OrganizationCompanyStatus,
  ORGANIZATION_COMPANY_STATUSES,
} from './organization-company-status';

export interface OrganizationCompanyState extends EntityState {
  organizationId: string;
  cnpj: string;
  razaoSocial: string;
  status: OrganizationCompanyStatus;
}

export class OrganizationCompany extends Entity<OrganizationCompanyState> {
  constructor(props: OrganizationCompanyState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get cnpj(): string {
    return this.props.cnpj;
  }

  get razaoSocial(): string {
    return this.props.razaoSocial;
  }

  get status(): OrganizationCompanyStatus {
    return this.props.status;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationCompany.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationCompany.cnpj',
        value: this.cnpj,
        rules: [new RequiredRule(), new CnpjRule()],
      },
      {
        code: 'organizationCompany.razaoSocial',
        value: this.razaoSocial,
        rules: [
          new RequiredRule(),
          new MinLengthRule(2),
          new MaxLengthRule(200),
        ],
      },
      {
        code: 'organizationCompany.status',
        value: this.status,
        rules: [new RequiredRule(), new InRule(ORGANIZATION_COMPANY_STATUSES)],
      },
    ]);
  }
}
