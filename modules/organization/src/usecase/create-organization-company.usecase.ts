import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { OrganizationRepository } from '../organization/provider';
import { normalizeCnpj } from '../organization-company/model/cnpj.utils';
import { OrganizationCompany } from '../organization-company/model';
import { OrganizationCompanyRepository } from '../organization-company/provider';
import {
  DEFAULT_ORGANIZATION_MAX_COMPANIES,
  OrganizationSettings,
} from '../organization-settings/model';
import { OrganizationSettingsRepository } from '../organization-settings/provider';

export interface CreateOrganizationCompanyIn {
  organizationId: string;
  cnpj: string;
  razaoSocial: string;
}

export class CreateOrganizationCompany
  implements UseCase<CreateOrganizationCompanyIn, OrganizationCompany>
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
    private readonly organizationRepository: OrganizationRepository,
    private readonly organizationSettingsRepository: OrganizationSettingsRepository,
  ) {}

  async execute(
    input: CreateOrganizationCompanyIn,
  ): Promise<OrganizationCompany> {
    const organization = await this.organizationRepository.findById(
      input.organizationId,
    );

    if (!organization) {
      throw new NotFoundError('Organização não encontrada');
    }

    const normalizedCnpj = normalizeCnpj(input.cnpj);
    const existing =
      await this.organizationCompanyRepository.findByCnpj(normalizedCnpj);

    if (existing) {
      throw new ValidationError('CNPJ já cadastrado');
    }

    let settings =
      await this.organizationSettingsRepository.findByOrganizationId(
        input.organizationId,
      );

    if (!settings) {
      const defaultSettings = new OrganizationSettings({
        organizationId: input.organizationId,
        maxCompanies: DEFAULT_ORGANIZATION_MAX_COMPANIES,
      });

      defaultSettings.validate();
      settings = await this.organizationSettingsRepository.create(defaultSettings);
    }

    const companiesPage = await this.organizationCompanyRepository.findPage({
      organizationId: input.organizationId,
      page: 1,
      perPage: 1,
    });

    if (companiesPage.total >= settings.maxCompanies) {
      throw new ValidationError(
        `Limite de ${settings.maxCompanies} empresa(s) atingido para esta organização`,
      );
    }

    const company = new OrganizationCompany({
      organizationId: input.organizationId,
      cnpj: normalizedCnpj,
      razaoSocial: input.razaoSocial,
      status: 'active',
    });

    company.validate();
    return this.organizationCompanyRepository.create(company);
  }
}
