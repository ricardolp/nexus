import { CreateOrganization } from '../../src/usecase/create-organization.usecase';
import { DEFAULT_ORGANIZATION_MAX_COMPANIES } from '../../src/organization-settings/model';
import { DEFAULT_ORGANIZATION_TI_ROLE } from '@nexus/shared';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';
import { FakeOrganizationRolePermissionRepository } from '../mock/fake-organization-role-permission.repository';
import { FakeOrganizationRoleRepository } from '../mock/fake-organization-role.repository';
import { FakeOrganizationSettingsRepository } from '../mock/fake-organization-settings.repository';

describe('CreateOrganization', () => {
  it('creates organization when actor is global admin', async () => {
    const repository = new FakeOrganizationRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();
    const roleRepository = new FakeOrganizationRoleRepository();
    const rolePermissionRepository =
      new FakeOrganizationRolePermissionRepository();
    const useCase = new CreateOrganization(
      repository,
      settingsRepository,
      roleRepository,
      rolePermissionRepository,
    );

    const organization = await useCase.execute({
      nome: 'Acme',
      slug: 'acme',
      actorRole: 'admin',
    });

    expect(organization.nome).toBe('Acme');
    expect(organization.slug).toBe('acme');

    const settings = await settingsRepository.findByOrganizationId(
      organization.id,
    );
    expect(settings?.maxCompanies).toBe(DEFAULT_ORGANIZATION_MAX_COMPANIES);

    const tiRole = await roleRepository.findByOrganizationAndSlug(
      organization.id,
      DEFAULT_ORGANIZATION_TI_ROLE.slug,
    );
    expect(tiRole?.nome).toBe(DEFAULT_ORGANIZATION_TI_ROLE.nome);

    const permissions = await rolePermissionRepository.findByRoleId(
      tiRole!.id,
    );
    expect(permissions.length).toBeGreaterThan(0);
  });

  it('rejects non-admin actors', async () => {
    const useCase = new CreateOrganization(
      new FakeOrganizationRepository(),
      new FakeOrganizationSettingsRepository(),
      new FakeOrganizationRoleRepository(),
      new FakeOrganizationRolePermissionRepository(),
    );

    await expect(
      useCase.execute({
        nome: 'Acme',
        slug: 'acme',
        actorRole: 'member',
      }),
    ).rejects.toThrow('Somente administradores podem criar organizações');
  });
});
