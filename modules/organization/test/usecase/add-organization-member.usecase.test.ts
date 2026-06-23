import { User } from '@nexus/auth';
import { FakeUserRepository } from '../../../auth/test/mock/fake-user.repository';
import { OrganizationRole } from '../../src/organization-role/model';
import { AddOrganizationMember } from '../../src/usecase/add-organization-member.usecase';
import { FakeOrganizationMemberRepository } from '../mock/fake-organization-member.repository';
import { FakeOrganizationRoleRepository } from '../mock/fake-organization-role.repository';

describe('AddOrganizationMember', () => {
  it('rejects admin global users', async () => {
    const userRepository = new FakeUserRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();

    const adminUser = new User({
      nome: 'Admin',
      sobrenome: 'Global',
      email: 'admin@example.com',
      senha: 'hashed',
      role: 'admin',
      emailConfirmadoEm: new Date(),
    });

    await userRepository.create(adminUser);

    const role = new OrganizationRole({
      organizationId: 'org-1',
      nome: 'Operador',
      slug: 'operador',
    });

    await roleRepository.create(role);

    const useCase = new AddOrganizationMember(
      memberRepository,
      roleRepository,
      userRepository,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        userId: adminUser.id,
        roleId: role.id,
      }),
    ).rejects.toThrow('Somente usuários member podem ser vinculados');
  });

  it('rejects members without confirmed email', async () => {
    const userRepository = new FakeUserRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    const memberRepository = new FakeOrganizationMemberRepository();

    const memberUser = new User({
      nome: 'Ana',
      sobrenome: 'Silva',
      email: 'ana@example.com',
      senha: 'hashed',
      role: 'member',
    });

    await userRepository.create(memberUser);

    const role = new OrganizationRole({
      organizationId: 'org-1',
      nome: 'Operador',
      slug: 'operador',
    });

    await roleRepository.create(role);

    const useCase = new AddOrganizationMember(
      memberRepository,
      roleRepository,
      userRepository,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        userId: memberUser.id,
        roleId: role.id,
      }),
    ).rejects.toThrow('Usuário precisa confirmar o e-mail');
  });
});
