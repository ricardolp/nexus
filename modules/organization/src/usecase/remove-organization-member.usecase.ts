import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationMemberRepository } from '../organization-member/provider';

export interface RemoveOrganizationMemberIn {
  organizationId: string;
  memberId: string;
}

export class RemoveOrganizationMember
  implements UseCase<RemoveOrganizationMemberIn, void>
{
  constructor(
    private readonly organizationMemberRepository: OrganizationMemberRepository,
  ) {}

  async execute(input: RemoveOrganizationMemberIn): Promise<void> {
    const member = await this.organizationMemberRepository.findById(
      input.memberId,
    );

    if (!member || member.organizationId !== input.organizationId) {
      throw new NotFoundError('Membro não encontrado');
    }

    await this.organizationMemberRepository.delete(member.id);
  }
}
