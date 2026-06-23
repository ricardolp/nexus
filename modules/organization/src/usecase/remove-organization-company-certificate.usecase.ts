import { NotFoundError, UseCase } from '@nexus/shared';
import {
  CertificateVaultProvider,
  OrganizationCompanyCertificateRepository,
} from '../organization-company-certificate/provider';

export interface RemoveOrganizationCompanyCertificateIn {
  organizationId: string;
  companyId: string;
  certificateId: string;
}

export class RemoveOrganizationCompanyCertificate
  implements UseCase<RemoveOrganizationCompanyCertificateIn, void>
{
  constructor(
    private readonly certificateRepository: OrganizationCompanyCertificateRepository,
    private readonly certificateVaultProvider: CertificateVaultProvider,
  ) {}

  async execute(input: RemoveOrganizationCompanyCertificateIn): Promise<void> {
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

    await this.certificateRepository.delete(input.certificateId);

    await this.certificateVaultProvider.deleteCertificate(
      certificate.keyVaultCertName,
    );

    if (certificate.passwordSecretName) {
      await this.certificateVaultProvider.deleteSecret(
        certificate.passwordSecretName,
      );
    }
  }
}
