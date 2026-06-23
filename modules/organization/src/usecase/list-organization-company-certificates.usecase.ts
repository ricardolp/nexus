import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../organization-company-certificate/model';
import { OrganizationCompanyCertificateRepository } from '../organization-company-certificate/provider';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface ListOrganizationCompanyCertificatesIn {
  organizationId: string;
  companyId: string;
  page?: number;
  perPage?: number;
}

export interface ListOrganizationCompanyCertificatesOut {
  items: OrganizationCompanyCertificate[];
  page: number;
  perPage: number;
  total: number;
}

export class ListOrganizationCompanyCertificates
  implements
    UseCase<
      ListOrganizationCompanyCertificatesIn,
      ListOrganizationCompanyCertificatesOut
    >
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
    private readonly certificateRepository: OrganizationCompanyCertificateRepository,
  ) {}

  async execute(
    input: ListOrganizationCompanyCertificatesIn,
  ): Promise<ListOrganizationCompanyCertificatesOut> {
    await this.ensureCompanyBelongsToOrganization(
      input.organizationId,
      input.companyId,
    );

    const page = input.page ?? 1;
    const perPage = input.perPage ?? 50;

    return this.certificateRepository.findPage({
      organizationId: input.organizationId,
      companyId: input.companyId,
      page,
      perPage,
    });
  }

  private async ensureCompanyBelongsToOrganization(
    organizationId: string,
    companyId: string,
  ): Promise<void> {
    const company =
      await this.organizationCompanyRepository.findById(companyId);

    if (!company || company.organizationId !== organizationId) {
      throw new NotFoundError('Empresa não encontrada');
    }
  }
}
