import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../organization-company-certificate/model';
import { OrganizationCompanyCertificateStatus } from '../organization-company-certificate/model/organization-company-certificate-status';
import { OrganizationCompanyCertificateRepository } from '../organization-company-certificate/provider';

export interface UpdateOrganizationCompanyCertificateIn {
  organizationId: string;
  companyId: string;
  certificateId: string;
  name?: string;
  description?: string;
  status?: OrganizationCompanyCertificateStatus;
}

export class UpdateOrganizationCompanyCertificate
  implements
    UseCase<
      UpdateOrganizationCompanyCertificateIn,
      OrganizationCompanyCertificate
    >
{
  constructor(
    private readonly certificateRepository: OrganizationCompanyCertificateRepository,
  ) {}

  async execute(
    input: UpdateOrganizationCompanyCertificateIn,
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

    if (input.status === 'active') {
      await this.certificateRepository.deactivateAllByCompanyId(
        input.companyId,
        input.certificateId,
      );
    }

    const updated = certificate.clone({
      name: input.name ?? certificate.name,
      description:
        input.description !== undefined
          ? input.description
          : certificate.description,
      status: input.status ?? certificate.status,
    });

    if (
      updated.status !== 'active' &&
      updated.status !== 'inactive' &&
      updated.status !== 'expired' &&
      updated.status !== 'revoked'
    ) {
      throw new ValidationError('Status de certificado inválido');
    }

    updated.validate();
    return this.certificateRepository.update(updated);
  }
}
