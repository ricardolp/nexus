import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface RemoveOrganizationCompanyIn {
  organizationId: string;
  companyId: string;
}

export class RemoveOrganizationCompany
  implements UseCase<RemoveOrganizationCompanyIn, void>
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
  ) {}

  async execute(input: RemoveOrganizationCompanyIn): Promise<void> {
    const company = await this.organizationCompanyRepository.findById(
      input.companyId,
    );

    if (!company || company.organizationId !== input.organizationId) {
      throw new NotFoundError('Empresa não encontrada');
    }

    await this.organizationCompanyRepository.delete(company.id);
  }
}
