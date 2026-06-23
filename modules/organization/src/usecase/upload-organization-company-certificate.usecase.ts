import { randomUUID } from 'crypto';
import tls from 'tls';
import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { OrganizationCompanyCertificate } from '../organization-company-certificate/model';
import {
  CertificateVaultProvider,
  OrganizationCompanyCertificateRepository,
} from '../organization-company-certificate/provider';
import { OrganizationCompanyRepository } from '../organization-company/provider';

export interface UploadOrganizationCompanyCertificateIn {
  organizationId: string;
  companyId: string;
  buffer: Buffer;
  password: string;
  name?: string;
  description?: string;
  status?: 'active' | 'inactive';
}

export class UploadOrganizationCompanyCertificate
  implements
    UseCase<
      UploadOrganizationCompanyCertificateIn,
      OrganizationCompanyCertificate
    >
{
  constructor(
    private readonly organizationCompanyRepository: OrganizationCompanyRepository,
    private readonly certificateRepository: OrganizationCompanyCertificateRepository,
    private readonly certificateVaultProvider: CertificateVaultProvider,
  ) {}

  async execute(
    input: UploadOrganizationCompanyCertificateIn,
  ): Promise<OrganizationCompanyCertificate> {
    const company = await this.organizationCompanyRepository.findById(
      input.companyId,
    );

    if (!company || company.organizationId !== input.organizationId) {
      throw new NotFoundError('Empresa não encontrada');
    }

    if (!input.buffer?.length) {
      throw new ValidationError('Arquivo de certificado é obrigatório');
    }

    if (!input.password) {
      throw new ValidationError('Senha do certificado é obrigatória');
    }

    this.validatePfx(input.buffer, input.password);

    const status = input.status ?? 'inactive';
    const certName = `company-${input.companyId.slice(0, 8)}-${randomUUID()}`;

    const importResult = await this.certificateVaultProvider.importPfx(
      certName,
      input.buffer,
      input.password,
    );

    if (status === 'active') {
      await this.certificateRepository.deactivateAllByCompanyId(input.companyId);
    }

    const certificate = new OrganizationCompanyCertificate({
      organizationId: input.organizationId,
      companyId: input.companyId,
      name: input.name ?? importResult.certName,
      description: input.description ?? null,
      status,
      keyVaultCertName: importResult.certName,
      keyVaultCertId: importResult.certId,
      keyVaultKeyId: importResult.keyId,
      passwordSecretName: importResult.passwordSecretName,
      passwordSecretId: importResult.passwordSecretId,
      thumbprint: importResult.thumbprint,
      subject: importResult.subject,
      issuer: importResult.issuer,
      expiresAt: importResult.expiresAt,
    });

    certificate.validate();
    return this.certificateRepository.create(certificate);
  }

  private validatePfx(buffer: Buffer, password: string): void {
    try {
      tls.createSecureContext({ pfx: buffer, passphrase: password });
    } catch {
      throw new ValidationError('Certificado ou senha inválidos');
    }
  }
}
