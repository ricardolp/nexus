import {
  Entity,
  EntityState,
  InRule,
  MaxLengthRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';
import {
  OrganizationCompanyCertificateStatus,
  ORGANIZATION_COMPANY_CERTIFICATE_STATUSES,
} from './organization-company-certificate-status';

export interface OrganizationCompanyCertificateState extends EntityState {
  organizationId: string;
  companyId: string;
  name?: string | null;
  description?: string | null;
  status: OrganizationCompanyCertificateStatus;
  keyVaultCertName: string;
  keyVaultCertId: string;
  keyVaultKeyId?: string | null;
  passwordSecretName?: string | null;
  passwordSecretId?: string | null;
  thumbprint?: string | null;
  subject?: string | null;
  issuer?: string | null;
  expiresAt?: Date | null;
}

export class OrganizationCompanyCertificate extends Entity<OrganizationCompanyCertificateState> {
  constructor(props: OrganizationCompanyCertificateState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get companyId(): string {
    return this.props.companyId;
  }

  get name(): string | null | undefined {
    return this.props.name;
  }

  get description(): string | null | undefined {
    return this.props.description;
  }

  get status(): OrganizationCompanyCertificateStatus {
    return this.props.status;
  }

  get keyVaultCertName(): string {
    return this.props.keyVaultCertName;
  }

  get keyVaultCertId(): string {
    return this.props.keyVaultCertId;
  }

  get keyVaultKeyId(): string | null | undefined {
    return this.props.keyVaultKeyId;
  }

  get passwordSecretName(): string | null | undefined {
    return this.props.passwordSecretName;
  }

  get passwordSecretId(): string | null | undefined {
    return this.props.passwordSecretId;
  }

  get thumbprint(): string | null | undefined {
    return this.props.thumbprint;
  }

  get subject(): string | null | undefined {
    return this.props.subject;
  }

  get issuer(): string | null | undefined {
    return this.props.issuer;
  }

  get expiresAt(): Date | null | undefined {
    return this.props.expiresAt;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationCompanyCertificate.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationCompanyCertificate.companyId',
        value: this.companyId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationCompanyCertificate.status',
        value: this.status,
        rules: [
          new RequiredRule(),
          new InRule(ORGANIZATION_COMPANY_CERTIFICATE_STATUSES),
        ],
      },
      {
        code: 'organizationCompanyCertificate.keyVaultCertName',
        value: this.keyVaultCertName,
        rules: [new RequiredRule(), new MaxLengthRule(127)],
      },
      {
        code: 'organizationCompanyCertificate.keyVaultCertId',
        value: this.keyVaultCertId,
        rules: [new RequiredRule(), new MaxLengthRule(500)],
      },
      {
        code: 'organizationCompanyCertificate.name',
        value: this.name,
        rules: [new MaxLengthRule(200)],
      },
      {
        code: 'organizationCompanyCertificate.description',
        value: this.description,
        rules: [new MaxLengthRule(500)],
      },
    ]);
  }
}
