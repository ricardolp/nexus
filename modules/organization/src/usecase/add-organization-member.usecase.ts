import { UserRepository } from '@nexus/auth';
import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { OrganizationMember } from '../organization-member/model';
import { OrganizationMemberRepository } from '../organization-member/provider';
import { OrganizationRoleRepository } from '../organization-role/provider';

export interface AddOrganizationMemberIn {
  organizationId: string;
  userId: string;
  roleId: string;
}

export class AddOrganizationMember
  implements UseCase<AddOrganizationMemberIn, OrganizationMember>
{
  constructor(
    private readonly organizationMemberRepository: OrganizationMemberRepository,
    private readonly organizationRoleRepository: OrganizationRoleRepository,
    private readonly userRepository: UserRepository,
  ) {}

  async execute(input: AddOrganizationMemberIn): Promise<OrganizationMember> {
    const user = await this.userRepository.findById(input.userId);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado');
    }

    if (user.role !== 'member') {
      throw new ValidationError('Somente usuários member podem ser vinculados');
    }

    if (!user.emailConfirmadoEm) {
      throw new ValidationError('Usuário precisa confirmar o e-mail');
    }

    const role = await this.organizationRoleRepository.findById(input.roleId);
    if (!role || role.organizationId !== input.organizationId) {
      throw new NotFoundError('Role não encontrada');
    }

    const existing =
      await this.organizationMemberRepository.findByOrganizationAndUser(
        input.organizationId,
        input.userId,
      );

    if (existing) {
      throw new ValidationError('Usuário já vinculado à organização');
    }

    const member = new OrganizationMember({
      organizationId: input.organizationId,
      userId: input.userId,
      roleId: input.roleId,
    });

    member.validate();
    return this.organizationMemberRepository.create(member);
  }
}
