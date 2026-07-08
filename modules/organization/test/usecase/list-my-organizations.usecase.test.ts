import { Organization } from '../../src/organization/model';
import { OrganizationMember } from '../../src/organization-member/model';
import { OrganizationRole } from '../../src/organization-role/model';
import { ListMyOrganizations } from '../../src/usecase/list-my-organizations.usecase';
import { FakeOrganizationMemberRepository } from '../mock/fake-organization-member.repository';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';
import { FakeOrganizationRoleRepository } from '../mock/fake-organization-role.repository';

describe('ListMyOrganizations', () => {
  it('returns organizations linked to a member user', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    const roleRepository = new FakeOrganizationRoleRepository();

    const organization = new Organization({
      nome: 'Acme',
      slug: 'acme',
    });

    const role = new OrganizationRole({
      organizationId: organization.id,
      nome: 'TI',
      slug: 'ti',
    });

    const membership = new OrganizationMember({
      organizationId: organization.id,
      userId: 'user-1',
      roleId: role.id,
    });

    await organizationRepository.create(organization);
    await roleRepository.create(role);
    await memberRepository.create(membership);

    const useCase = new ListMyOrganizations(
      organizationRepository,
      memberRepository,
      roleRepository,
    );

    const result = await useCase.execute({
      userId: 'user-1',
      actorRole: 'member',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: organization.id,
      nome: 'Acme',
      slug: 'acme',
      logo: null,
      role: {
        id: role.id,
        nome: 'TI',
        slug: 'ti',
      },
    });
  });

  it('returns all organizations for global admin users', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    const roleRepository = new FakeOrganizationRoleRepository();

    const organizationA = new Organization({
      nome: 'Acme',
      slug: 'acme',
    });
    const organizationB = new Organization({
      nome: 'Beta',
      slug: 'beta',
    });

    await organizationRepository.create(organizationA);
    await organizationRepository.create(organizationB);

    const useCase = new ListMyOrganizations(
      organizationRepository,
      memberRepository,
      roleRepository,
    );

    const result = await useCase.execute({
      userId: 'admin-1',
      actorRole: 'admin',
    });

    expect(result.items).toHaveLength(2);
    expect(result.items).toEqual(
      expect.arrayContaining([
        {
          id: organizationA.id,
          nome: 'Acme',
          slug: 'acme',
          logo: null,
          role: null,
        },
        {
          id: organizationB.id,
          nome: 'Beta',
          slug: 'beta',
          logo: null,
          role: null,
        },
      ]),
    );
  });

  it('returns empty list when member has no organizations', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const memberRepository = new FakeOrganizationMemberRepository();
    const roleRepository = new FakeOrganizationRoleRepository();

    const useCase = new ListMyOrganizations(
      organizationRepository,
      memberRepository,
      roleRepository,
    );

    const result = await useCase.execute({
      userId: 'user-without-orgs',
      actorRole: 'member',
    });

    expect(result.items).toEqual([]);
  });
});
