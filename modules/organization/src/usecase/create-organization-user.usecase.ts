import { CryptoProvider, User, UserRepository } from '@nexus/auth';
import {
  DEFAULT_ORGANIZATION_TI_ROLE,
  NotFoundError,
  StrongPasswordRule,
  UseCase,
  ValidationError,
  Validator,
} from '@nexus/shared';
import { OrganizationMember } from '../organization-member/model';
import { OrganizationMemberRepository } from '../organization-member/provider';
import { OrganizationRoleRepository } from '../organization-role/provider';
import { AddOrganizationMember } from './add-organization-member.usecase';

export interface CreateOrganizationUserIn {
  organizationId: string;
  nome: string;
  sobrenome: string;
  email: string;
  senha: string;
  roleId?: string;
}

export interface CreateOrganizationUserOut {
  user: User;
  member: OrganizationMember;
}

export class CreateOrganizationUser
  implements UseCase<CreateOrganizationUserIn, CreateOrganizationUserOut>
{
  constructor(
    private readonly cryptoProvider: CryptoProvider,
    private readonly userRepository: UserRepository,
    private readonly organizationRoleRepository: OrganizationRoleRepository,
    private readonly organizationMemberRepository: OrganizationMemberRepository,
  ) {}

  async execute(
    input: CreateOrganizationUserIn,
  ): Promise<CreateOrganizationUserOut> {
    Validator.validate([
      {
        code: 'user.senha',
        value: input.senha,
        rules: [new StrongPasswordRule()],
      },
    ]);

    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new ValidationError('E-mail já cadastrado');
    }

    const role = input.roleId
      ? await this.organizationRoleRepository.findById(input.roleId)
      : await this.organizationRoleRepository.findByOrganizationAndSlug(
          input.organizationId,
          DEFAULT_ORGANIZATION_TI_ROLE.slug,
        );

    if (!role || role.organizationId !== input.organizationId) {
      throw new NotFoundError(
        input.roleId
          ? 'Perfil não encontrado nesta organização'
          : 'Role TI não encontrada nesta organização. Crie a organização novamente ou configure a role manualmente.',
      );
    }

    const hashedPassword = await this.cryptoProvider.encrypt(input.senha);
    const user = new User({
      nome: input.nome,
      sobrenome: input.sobrenome,
      email: input.email,
      senha: hashedPassword,
      role: 'member',
      emailConfirmadoEm: new Date(),
    });

    user.validate();
    const createdUser = await this.userRepository.create(user);

    const member = await new AddOrganizationMember(
      this.organizationMemberRepository,
      this.organizationRoleRepository,
      this.userRepository,
    ).execute({
      organizationId: input.organizationId,
      userId: createdUser.id,
      roleId: role.id,
    });

    return { user: createdUser, member };
  }
}
