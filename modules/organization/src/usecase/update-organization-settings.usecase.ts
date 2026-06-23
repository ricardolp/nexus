import { ForbiddenError, NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';
import { OrganizationSettings } from '../organization-settings/model';
import { OrganizationSettingsRepository } from '../organization-settings/provider';

export interface UpdateOrganizationSettingsIn {
  organizationId: string;
  maxCompanies: number;
  actorRole: string;
}

export class UpdateOrganizationSettings
  implements UseCase<UpdateOrganizationSettingsIn, OrganizationSettings>
{
  constructor(
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(
    input: UpdateOrganizationSettingsIn,
  ): Promise<OrganizationSettings> {
    if (input.actorRole !== 'admin') {
      throw new ForbiddenError(
        'Somente administradores podem alterar configurações da organização',
      );
    }

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

    const updated = settings.clone({ maxCompanies: input.maxCompanies });
    updated.validate();

    return this.organizationSettingsRepository.update(updated);
  }
}
