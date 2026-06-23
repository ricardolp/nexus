import { ForbiddenError, PageResult, UseCase } from '@nexus/shared';
import { Organization } from '../organization/model';
import { OrganizationRepository } from '../organization/provider';

export interface ListOrganizationsIn {
  page: number;
  perPage: number;
  actorRole: string;
}

export class ListOrganizations
  implements UseCase<ListOrganizationsIn, PageResult<Organization>>
{
  constructor(
    private readonly organizationRepository: OrganizationRepository,
  ) {}

  async execute(input: ListOrganizationsIn): Promise<PageResult<Organization>> {
    if (input.actorRole !== 'admin') {
      throw new ForbiddenError('Somente administradores podem listar organizações');
    }

    return this.organizationRepository.findPage({
      page: input.page,
      perPage: input.perPage,
    });
  }
}
