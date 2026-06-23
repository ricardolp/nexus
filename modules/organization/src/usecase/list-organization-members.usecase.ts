import { PageResult, UseCase } from '@nexus/shared';
import { OrganizationMember } from '../organization-member/model';
import { OrganizationMemberRepository } from '../organization-member/provider';

export interface ListOrganizationMembersIn {
  organizationId: string;
  page: number;
  perPage: number;
}

export class ListOrganizationMembers
  implements UseCase<ListOrganizationMembersIn, PageResult<OrganizationMember>>
{
  constructor(
    private readonly organizationMemberRepository: OrganizationMemberRepository,
  ) {}

  execute(
    input: ListOrganizationMembersIn,
  ): Promise<PageResult<OrganizationMember>> {
    return this.organizationMemberRepository.findPage({
      organizationId: input.organizationId,
      page: input.page,
      perPage: input.perPage,
    });
  }
}
