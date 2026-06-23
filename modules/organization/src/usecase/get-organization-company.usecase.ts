import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationCompany } from '../organization-company/model';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface GetOrganizationCompanyIn {
  organizationId: string;
  companyId: string;
}

export class GetOrganizationCompany
  implements UseCase<GetOrganizationCompanyIn, OrganizationCompany>
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
  ) {}

  async execute(input: GetOrganizationCompanyIn): Promise<OrganizationCompany> {
    const company = await this.organizationCompanyRepository.findById(
      input.companyId,
    );

    if (!company || company.organizationId !== input.organizationId) {
      throw new NotFoundError('Empresa não encontrada');
    }

    return company;
  }
}
