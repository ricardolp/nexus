import { Organization } from '../../src/organization/model';
import {
  DEFAULT_ORGANIZATION_MAX_COMPANIES,
  OrganizationSettings,
} from '../../src/organization-settings/model';
import { CreateOrganizationCompany } from '../../src/usecase/create-organization-company.usecase';
import { ListOrganizationCompanies } from '../../src/usecase/list-organization-companies.usecase';
import { UpdateOrganizationCompany } from '../../src/usecase/update-organization-company.usecase';
import { FakeOrganizationCompanyRepository } from '../mock/fake-organization-company.repository';
import { FakeOrganizationRepository } from '../mock/fake-organization.repository';
import { FakeOrganizationSettingsRepository } from '../mock/fake-organization-settings.repository';

const VALID_CNPJ = '04252011000110';

async function seedOrganizationSettings(
  settingsRepository: FakeOrganizationSettingsRepository,
  organizationId: string,
  maxCompanies = DEFAULT_ORGANIZATION_MAX_COMPANIES,
) {
  const settings = new OrganizationSettings({
    organizationId,
    maxCompanies,
  });
  await settingsRepository.create(settings);
}

function createCompanyUseCase(
  companyRepository: FakeOrganizationCompanyRepository,
  organizationRepository: FakeOrganizationRepository,
  settingsRepository: FakeOrganizationSettingsRepository,
) {
  return new CreateOrganizationCompany(
    companyRepository,
    organizationRepository,
    settingsRepository,
  );
}

describe('CreateOrganizationCompany', () => {
  it('creates company with normalized cnpj and active status', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const companyRepository = new FakeOrganizationCompanyRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Org Teste',
      slug: 'org-teste',
    });
    await organizationRepository.create(organization);
    await seedOrganizationSettings(settingsRepository, organization.id);

    const useCase = createCompanyUseCase(
      companyRepository,
      organizationRepository,
      settingsRepository,
    );

    const company = await useCase.execute({
      organizationId: organization.id,
      cnpj: '04.252.011/0001-10',
      razaoSocial: 'Empresa Exemplo LTDA',
    });

    expect(company.cnpj).toBe(VALID_CNPJ);
    expect(company.razaoSocial).toBe('Empresa Exemplo LTDA');
    expect(company.status).toBe('active');
    expect(company.organizationId).toBe(organization.id);
  });

  it('rejects duplicate cnpj globally', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const companyRepository = new FakeOrganizationCompanyRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const org1 = new Organization({ nome: 'Org 1', slug: 'org-1' });
    const org2 = new Organization({ nome: 'Org 2', slug: 'org-2' });
    await organizationRepository.create(org1);
    await organizationRepository.create(org2);
    await seedOrganizationSettings(settingsRepository, org1.id, 5);
    await seedOrganizationSettings(settingsRepository, org2.id, 5);

    const useCase = createCompanyUseCase(
      companyRepository,
      organizationRepository,
      settingsRepository,
    );

    await useCase.execute({
      organizationId: org1.id,
      cnpj: VALID_CNPJ,
      razaoSocial: 'Empresa A',
    });

    await expect(
      useCase.execute({
        organizationId: org2.id,
        cnpj: VALID_CNPJ,
        razaoSocial: 'Empresa B',
      }),
    ).rejects.toThrow('CNPJ já cadastrado');
  });

  it('rejects when organization does not exist', async () => {
    const useCase = createCompanyUseCase(
      new FakeOrganizationCompanyRepository(),
      new FakeOrganizationRepository(),
      new FakeOrganizationSettingsRepository(),
    );

    await expect(
      useCase.execute({
        organizationId: 'missing-org',
        cnpj: VALID_CNPJ,
        razaoSocial: 'Empresa A',
      }),
    ).rejects.toThrow('Organização não encontrada');
  });

  it('rejects when company limit is reached', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const companyRepository = new FakeOrganizationCompanyRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Org Teste',
      slug: 'org-teste',
    });
    await organizationRepository.create(organization);
    await seedOrganizationSettings(settingsRepository, organization.id, 1);

    const useCase = createCompanyUseCase(
      companyRepository,
      organizationRepository,
      settingsRepository,
    );

    await useCase.execute({
      organizationId: organization.id,
      cnpj: VALID_CNPJ,
      razaoSocial: 'Empresa A',
    });

    await expect(
      useCase.execute({
        organizationId: organization.id,
        cnpj: '11222333000181',
        razaoSocial: 'Empresa B',
      }),
    ).rejects.toThrow('Limite de 1 empresa(s) atingido para esta organização');
  });
});

describe('ListOrganizationCompanies', () => {
  it('lists companies scoped by organization', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const companyRepository = new FakeOrganizationCompanyRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const org1 = new Organization({ nome: 'Org 1', slug: 'org-1' });
    const org2 = new Organization({ nome: 'Org 2', slug: 'org-2' });
    await organizationRepository.create(org1);
    await organizationRepository.create(org2);
    await seedOrganizationSettings(settingsRepository, org1.id, 5);
    await seedOrganizationSettings(settingsRepository, org2.id, 5);

    const createUseCase = createCompanyUseCase(
      companyRepository,
      organizationRepository,
      settingsRepository,
    );

    await createUseCase.execute({
      organizationId: org1.id,
      cnpj: VALID_CNPJ,
      razaoSocial: 'Empresa A',
    });

    await createUseCase.execute({
      organizationId: org2.id,
      cnpj: '11222333000181',
      razaoSocial: 'Empresa B',
    });

    const listUseCase = new ListOrganizationCompanies(companyRepository);
    const result = await listUseCase.execute({
      organizationId: org1.id,
      page: 1,
      perPage: 20,
    });

    expect(result.total).toBe(1);
    expect(result.items[0]?.razaoSocial).toBe('Empresa A');
  });
});

describe('UpdateOrganizationCompany', () => {
  it('updates status and razao social', async () => {
    const organizationRepository = new FakeOrganizationRepository();
    const companyRepository = new FakeOrganizationCompanyRepository();
    const settingsRepository = new FakeOrganizationSettingsRepository();

    const organization = new Organization({
      nome: 'Org Teste',
      slug: 'org-teste',
    });
    await organizationRepository.create(organization);
    await seedOrganizationSettings(settingsRepository, organization.id);

    const createUseCase = createCompanyUseCase(
      companyRepository,
      organizationRepository,
      settingsRepository,
    );

    const company = await createUseCase.execute({
      organizationId: organization.id,
      cnpj: VALID_CNPJ,
      razaoSocial: 'Empresa Exemplo LTDA',
    });

    const updateUseCase = new UpdateOrganizationCompany(companyRepository);
    const updated = await updateUseCase.execute({
      organizationId: organization.id,
      companyId: company.id,
      razaoSocial: 'Empresa Atualizada LTDA',
      status: 'inactive',
    });

    expect(updated.razaoSocial).toBe('Empresa Atualizada LTDA');
    expect(updated.status).toBe('inactive');
    expect(updated.cnpj).toBe(VALID_CNPJ);
  });
});
