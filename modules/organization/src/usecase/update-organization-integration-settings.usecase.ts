import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';
import { OrganizationSettings } from '../organization-settings/model';
import { OrganizationSettingsRepository } from '../organization-settings/provider';

export interface UpdateOrganizationIntegrationSettingsIn {
  organizationId: string;
  integrationBaseUrl?: string | null;
  integrationClientId?: string | null;
  integrationSecretKeyVaultName?: string | null;
  integrationSecretKeyVaultId?: string | null;
  integrationClientSecretLocal?: string | null;
  sapClient?: string | null;
  sapLanguage?: string | null;
}

export class UpdateOrganizationIntegrationSettings
  implements UseCase<UpdateOrganizationIntegrationSettingsIn, OrganizationSettings>
{
  constructor(
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: UpdateOrganizationIntegrationSettingsIn,
  ): Promise<OrganizationSettings> {
    const organization = await this.organizationRepository.findById(
      input.organizationId,
    );
    if (!organization) {
      throw new NotFoundError('Organização não encontrada');
    }

    const settings =
      await this.organizationSettingsRepository.findByOrganizationId(
        input.organizationId,
      );
    if (!settings) {
      throw new NotFoundError('Configurações da organização não encontradas');
    }

    const updated = settings.clone({
      integrationBaseUrl: input.integrationBaseUrl ?? settings.integrationBaseUrl,
      integrationClientId:
        input.integrationClientId ?? settings.integrationClientId,
      integrationSecretKeyVaultName:
        input.integrationSecretKeyVaultName ??
        settings.integrationSecretKeyVaultName,
      integrationSecretKeyVaultId:
        input.integrationSecretKeyVaultId ??
        settings.integrationSecretKeyVaultId,
      integrationClientSecretLocal:
        input.integrationClientSecretLocal ??
        settings.integrationClientSecretLocal,
      sapClient: input.sapClient ?? settings.sapClient,
      sapLanguage: input.sapLanguage ?? settings.sapLanguage,
    });
    updated.validate();
    return this.organizationSettingsRepository.update(updated);
  }
}
