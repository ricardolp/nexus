import { NotFoundError, UseCase } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../organization-company-certificate/model';
import { OrganizationCompanyCertificateRepository } from '../organization-company-certificate/provider';

export interface GetOrganizationCompanyCertificateIn {
  organizationId: string;
  companyId: string;
  certificateId: string;
}

export class GetOrganizationCompanyCertificate
  implements
    UseCase<GetOrganizationCompanyCertificateIn, OrganizationCompanyCertificate>
{
  constructor(
    private readonly certificateRepository: OrganizationCompanyCertificateRepository,
  ) {}

  async execute(
    input: GetOrganizationCompanyCertificateIn,
  ): Promise<OrganizationCompanyCertificate> {
    const certificate = await this.certificateRepository.findById(
      input.certificateId,
    );

    if (
      !certificate ||
      certificate.organizationId !== input.organizationId ||
      certificate.companyId !== input.companyId
    ) {
      throw new NotFoundError('Certificado não encontrado');
    }

    return certificate;
  }
}
