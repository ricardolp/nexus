import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { OrganizationCompanyStatus } from '../organization-company/model';
import { OrganizationCompany } from '../organization-company/model';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface UpdateOrganizationCompanyIn {
  organizationId: string;
  companyId: string;
  razaoSocial?: string;
  status?: OrganizationCompanyStatus;
}

export class UpdateOrganizationCompany
  implements UseCase<UpdateOrganizationCompanyIn, OrganizationCompany>
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
  ) {}

  async execute(
    input: UpdateOrganizationCompanyIn,
  ): Promise<OrganizationCompany> {
    const company = await this.organizationCompanyRepository.findById(
      input.companyId,
    );

    if (!company || company.organizationId !== input.organizationId) {
      throw new NotFoundError('Empresa não encontrada');
    }

    if (input.razaoSocial === undefined && input.status === undefined) {
      throw new ValidationError('Nenhum campo para atualizar');
    }

    const updated = company.clone({
      razaoSocial: input.razaoSocial ?? company.razaoSocial,
      status: input.status ?? company.status,
    });

    updated.validate();
    return this.organizationCompanyRepository.update(updated);
  }
}
