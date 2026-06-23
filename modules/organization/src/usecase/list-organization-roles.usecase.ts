import { PageResult, UseCase } from '@nexus/shared';
import { OrganizationRole } from '../organization-role/model';
import { OrganizationRoleRepository } from '../organization-role/provider';

export interface ListOrganizationRolesIn {
  organizationId: string;
  page: number;
  perPage: number;
}

export class ListOrganizationRoles
  implements UseCase<ListOrganizationRolesIn, PageResult<OrganizationRole>>
{
  constructor(
    private readonly organizationRoleRepository: OrganizationRoleRepository,
  ) {}

  execute(input: ListOrganizationRolesIn): Promise<PageResult<OrganizationRole>> {
    return this.organizationRoleRepository.findPage({
      organizationId: input.organizationId,
      page: input.page,
      perPage: input.perPage,
    });
  }
}
