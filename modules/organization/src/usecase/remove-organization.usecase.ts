import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';

export interface RemoveOrganizationIn {
  organizationId: string;
}

export class RemoveOrganization implements UseCase<RemoveOrganizationIn, void> {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: RemoveOrganizationIn): Promise<void> {
    const organization = await this.organizationRepository.findById(
      input.organizationId,
    );

    if (!organization) {
      throw new NotFoundError('Organização não encontrada');
    }

    await this.organizationRepository.delete(organization.id);
  }
}
