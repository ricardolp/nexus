import { FakeUserRepository } from '../../../auth/test/mock/fake-user.repository';
import { DEFAULT_ORGANIZATION_TI_ROLE } from '@nexus/shared';
import { OrganizationRole } from '../../src/organization-role/model';
import { CreateOrganizationUser } from '../../src/usecase/create-organization-user.usecase';
import { FakeCryptoProvider } from '../../../auth/test/mock/fake-crypto.provider';
import { FakeOrganizationMemberRepository } from '../mock/fake-organization-member.repository';
import { FakeOrganizationRoleRepository } from '../mock/fake-organization-role.repository';

describe('CreateOrganizationUser', () => {
  const organizationId = 'org-1';

  function createTiRole(roleRepository: FakeOrganizationRoleRepository) {
    const role = new OrganizationRole({
      organizationId,
      nome: DEFAULT_ORGANIZATION_TI_ROLE.nome,
      slug: DEFAULT_ORGANIZATION_TI_ROLE.slug,
    });
    role.validate();
    return roleRepository.create(role);
  }

  it('creates user and links as organization member', async () => {
    const userRepository = new FakeUserRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    const tiRole = await createTiRole(roleRepository);

    const useCase = new CreateOrganizationUser(
      new FakeCryptoProvider(),
      userRepository,
      roleRepository,
      memberRepository,
    );

    const result = await useCase.execute({
      organizationId,
      nome: 'Maria',
      sobrenome: 'Santos',
      email: 'maria@example.com',
      senha: 'Senha@123456',
    });

    expect(result.user.email).toBe('maria@example.com');
    expect(result.user.emailConfirmadoEm).toBeInstanceOf(Date);
    expect(result.member.userId).toBe(result.user.id);
    expect(result.member.roleId).toBe(tiRole.id);
  });

  it('rejects duplicate email', async () => {
    const userRepository = new FakeUserRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    await createTiRole(roleRepository);

    const useCase = new CreateOrganizationUser(
      new FakeCryptoProvider(),
      userRepository,
      roleRepository,
      new FakeOrganizationMemberRepository(),
    );

    await useCase.execute({
      organizationId,
      nome: 'Maria',
      sobrenome: 'Santos',
      email: 'maria@example.com',
      senha: 'Senha@123456',
    });

    await expect(
      useCase.execute({
        organizationId,
        nome: 'Outra',
        sobrenome: 'Pessoa',
        email: 'maria@example.com',
        senha: 'Senha@123456',
      }),
    ).rejects.toThrow('E-mail já cadastrado');
  });

  it('uses provided roleId when informed', async () => {
    const userRepository = new FakeUserRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    await createTiRole(roleRepository);
    const customRole = await roleRepository.create(
      new OrganizationRole({
        organizationId,
        nome: 'Financeiro',
        slug: 'financeiro',
      }),
    );

    const useCase = new CreateOrganizationUser(
      new FakeCryptoProvider(),
      userRepository,
      roleRepository,
      memberRepository,
    );

    const result = await useCase.execute({
      organizationId,
      nome: 'João',
      sobrenome: 'Silva',
      email: 'joao@example.com',
      senha: 'Senha@123456',
      roleId: customRole.id,
    });

    expect(result.member.roleId).toBe(customRole.id);
  });
});
