import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';
import { OrganizationSettings } from '../organization-settings/model';
import { OrganizationSettingsRepository } from '../organization-settings/provider';

export interface GetOrganizationSettingsIn {
  organizationId: string;
}

export class GetOrganizationSettings
  implements UseCase<GetOrganizationSettingsIn, OrganizationSettings>
{
  constructor(
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: GetOrganizationSettingsIn,
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

    return settings;
  }
}
