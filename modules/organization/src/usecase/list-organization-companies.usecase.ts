import { PageResult, UseCase } from '@nexus/shared';
import { OrganizationCompany } from '../organization-company/model';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface ListOrganizationCompaniesIn {
  organizationId: string;
  page: number;
  perPage: number;
}

export class ListOrganizationCompanies
  implements
    UseCase<ListOrganizationCompaniesIn, PageResult<OrganizationCompany>>
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
  ) {}

  execute(
    input: ListOrganizationCompaniesIn,
  ): Promise<PageResult<OrganizationCompany>> {
    return this.organizationCompanyRepository.findPage({
      organizationId: input.organizationId,
      page: input.page,
      perPage: input.perPage,
    });
  }
}
