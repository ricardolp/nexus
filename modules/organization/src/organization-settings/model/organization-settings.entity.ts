import {
  Entity,
  EntityState,
  IntegerRule,
  MinValueRule,
  RequiredRule,
  Validator,
} from '@nexus/shared';

export interface OrganizationSettingsState extends EntityState {
  organizationId: string;
  maxCompanies: number;
  integrationBaseUrl?: string | null;
  integrationClientId?: string | null;
  integrationSecretKeyVaultName?: string | null;
  integrationSecretKeyVaultId?: string | null;
  integrationClientSecretLocal?: string | null;
  sapClient?: string | null;
  sapLanguage?: string | null;
}

export class OrganizationSettings extends Entity<OrganizationSettingsState> {
  constructor(props: OrganizationSettingsState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get maxCompanies(): number {
    return this.props.maxCompanies;
  }

  get integrationBaseUrl(): string | null | undefined {
    return this.props.integrationBaseUrl;
  }

  get integrationClientId(): string | null | undefined {
    return this.props.integrationClientId;
  }

  get integrationSecretKeyVaultName(): string | null | undefined {
    return this.props.integrationSecretKeyVaultName;
  }

  get integrationSecretKeyVaultId(): string | null | undefined {
    return this.props.integrationSecretKeyVaultId;
  }

  get integrationClientSecretLocal(): string | null | undefined {
    return this.props.integrationClientSecretLocal;
  }

  get sapClient(): string | null | undefined {
    return this.props.sapClient;
  }

  get sapLanguage(): string | null | undefined {
    return this.props.sapLanguage;
  }

  validate(): void {
    Validator.validate([
      {
        code: 'organizationSettings.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'organizationSettings.maxCompanies',
        value: this.maxCompanies,
        rules: [new RequiredRule(), new IntegerRule(), new MinValueRule(1)],
      },
    ]);
  }
}
