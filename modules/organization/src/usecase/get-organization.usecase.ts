import { NotFoundError, UseCase } from '@nexus/shared';
import { Organization } from '../organization/model';
import { OrganizationRepository } from '../organization/provider';

export interface GetOrganizationIn {
  organizationId: string;
}

export class GetOrganization
  implements UseCase<GetOrganizationIn, Organization>
{
  constructor(private readonly organizationRepository: OrganizationRepository) {}

  async execute(input: GetOrganizationIn): Promise<Organization> {
    const organization = await this.organizationRepository.findById(
      input.organizationId,
    );

    if (!organization) {
      throw new NotFoundError('Organização não encontrada');
    }

    return organization;
  }
}
