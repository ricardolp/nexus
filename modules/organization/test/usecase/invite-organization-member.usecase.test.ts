import { FakeAuthTokenRepository } from '../../../auth/test/mock/fake-auth-token.repository';
import { FakeTransactionalEmailProvider } from '../../../auth/test/mock/fake-transactional-email.provider';
import { FakeUserRepository } from '../../../auth/test/mock/fake-user.repository';
import { User } from '@nexus/auth';
import { DEFAULT_ORGANIZATION_TI_ROLE } from '@nexus/shared';
import { OrganizationRole } from '../../src/organization-role/model';
import { InviteOrganizationMember } from '../../src/usecase/invite-organization-member.usecase';
import { FakeOrganizationMemberRepository } from '../mock/fake-organization-member.repository';
import { FakeOrganizationRoleRepository } from '../mock/fake-organization-role.repository';

describe('InviteOrganizationMember', () => {
  const organizationId = 'org-1';
  const appUrl = 'http://localhost:3000';

  function createTiRole(roleRepository: FakeOrganizationRoleRepository) {
    const role = new OrganizationRole({
      organizationId,
      nome: DEFAULT_ORGANIZATION_TI_ROLE.nome,
      slug: DEFAULT_ORGANIZATION_TI_ROLE.slug,
    });
    role.validate();
    return roleRepository.create(role);
  }

  it('sends invite for new email', async () => {
    const userRepository = new FakeUserRepository();
    const authTokenRepository = new FakeAuthTokenRepository();
    const emailProvider = new FakeTransactionalEmailProvider();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    await createTiRole(roleRepository);

    const useCase = new InviteOrganizationMember(
      userRepository,
      authTokenRepository,
      emailProvider,
      roleRepository,
      memberRepository,
      appUrl,
    );

    const result = await useCase.execute({
      organizationId,
      email: 'new@example.com',
      invitedBy: 'Admin',
      actorRole: 'admin',
    });

    expect(result.action).toBe('invited');
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0].to).toBe('new@example.com');
  });

  it('links existing confirmed user directly', async () => {
    const userRepository = new FakeUserRepository();
    const authTokenRepository = new FakeAuthTokenRepository();
    const emailProvider = new FakeTransactionalEmailProvider();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    const tiRole = await createTiRole(roleRepository);

    const user = new User({
      nome: 'João',
      sobrenome: 'Silva',
      email: 'joao@example.com',
      senha: 'hashed',
      role: 'member',
      emailConfirmadoEm: new Date(),
    });
    const createdUser = await userRepository.create(user);

    const useCase = new InviteOrganizationMember(
      userRepository,
      authTokenRepository,
      emailProvider,
      roleRepository,
      memberRepository,
      appUrl,
    );

    const result = await useCase.execute({
      organizationId,
      email: 'joao@example.com',
      invitedBy: 'Admin',
      actorRole: 'admin',
    });

    expect(result.action).toBe('linked');
    if (result.action === 'linked') {
      expect(result.member.userId).toBe(createdUser.id);
      expect(result.member.roleId).toBe(tiRole.id);
    }
  });

  it('rejects when TI role is missing', async () => {
    const useCase = new InviteOrganizationMember(
      new FakeUserRepository(),
      new FakeAuthTokenRepository(),
      new FakeTransactionalEmailProvider(),
      new FakeOrganizationRoleRepository(),
      new FakeOrganizationMemberRepository(),
      appUrl,
    );

    await expect(
      useCase.execute({
        organizationId,
        email: 'new@example.com',
        invitedBy: 'Admin',
        actorRole: 'admin',
      }),
    ).rejects.toThrow('Role TI não encontrada');
  });

  it('rejects non-admin actors', async () => {
    const roleRepository = new FakeOrganizationRoleRepository();
    await createTiRole(roleRepository);

    const useCase = new InviteOrganizationMember(
      new FakeUserRepository(),
      new FakeAuthTokenRepository(),
      new FakeTransactionalEmailProvider(),
      roleRepository,
      new FakeOrganizationMemberRepository(),
      appUrl,
    );

    await expect(
      useCase.execute({
        organizationId,
        email: 'new@example.com',
        invitedBy: 'Admin',
        actorRole: 'member',
      }),
    ).rejects.toThrow('Somente administradores podem convidar membros');
  });
});
