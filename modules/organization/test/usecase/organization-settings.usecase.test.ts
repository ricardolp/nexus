import { Organization } from '../../src/organization/model';
import {
  DEFAULT_ORGANIZATION_MAX_COMPANIES,
  OrganizationSettings,
} from '../../src/organization-settings/model';
import { GetOrganizationSettings } from '../../src/usecase/get-organization-settings.usecase';
import { UpdateOrganizationSettings } from '../../src/usecase/update-organization-settings.usecase';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';
import { FakeOrganizationSettingsRepository } from '../mock/fake-organization-settings.repository';

describe('GetOrganizationSettings', () => {
  it('returns settings for existing organization', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Acme',
      slug: 'acme',
    });
    await organizationRepository.create(organization);

    const settings = new OrganizationSettings({
      organizationId: organization.id,
      maxCompanies: 3,
    });
    await settingsRepository.create(settings);

    const result = await new GetOrganizationSettings(
      settingsRepository,
      organizationRepository,
    ).execute({ organizationId: organization.id });

    expect(result.maxCompanies).toBe(3);
  });

  it('rejects when organization does not exist', async () => {
    await expect(
      new GetOrganizationSettings(
        new FakeOrganizationSettingsRepository(),
        new FakeOrganizationRepository(),
      ).execute({ organizationId: 'missing-org' }),
    ).rejects.toThrow('Organização não encontrada');
  });
});

describe('UpdateOrganizationSettings', () => {
  it('updates maxCompanies when actor is global admin', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Acme',
      slug: 'acme',
    });
    await organizationRepository.create(organization);

    const settings = new OrganizationSettings({
      organizationId: organization.id,
      maxCompanies: DEFAULT_ORGANIZATION_MAX_COMPANIES,
    });
    await settingsRepository.create(settings);

    const updated = await new UpdateOrganizationSettings(
      settingsRepository,
      organizationRepository,
    ).execute({
      organizationId: organization.id,
      maxCompanies: 10,
      actorRole: 'admin',
    });

    expect(updated.maxCompanies).toBe(10);
  });

  it('rejects non-admin actors', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Acme',
      slug: 'acme',
    });
    await organizationRepository.create(organization);

    await settingsRepository.create(
      new OrganizationSettings({
        organizationId: organization.id,
        maxCompanies: 1,
      }),
    );

    await expect(
      new UpdateOrganizationSettings(
        settingsRepository,
        organizationRepository,
      ).execute({
        organizationId: organization.id,
        maxCompanies: 5,
        actorRole: 'member',
      }),
    ).rejects.toThrow(
      'Somente administradores podem alterar configurações da organização',
    );
  });
});
