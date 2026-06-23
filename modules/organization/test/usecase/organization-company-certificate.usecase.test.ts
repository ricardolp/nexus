import tls from 'tls';
import { OrganizationCompany } from '../../src/organization-company/model';
import { OrganizationCompanyCertificate } from '../../src/organization-company-certificate/model';
import { GetOrganizationCompanyCertificate } from '../../src/usecase/get-organization-company-certificate.usecase';
import { ListOrganizationCompanyCertificates } from '../../src/usecase/list-organization-company-certificates.usecase';
import { RemoveOrganizationCompanyCertificate } from '../../src/usecase/remove-organization-company-certificate.usecase';
import { UpdateOrganizationCompanyCertificate } from '../../src/usecase/update-organization-company-certificate.usecase';
import { UploadOrganizationCompanyCertificate } from '../../src/usecase/upload-organization-company-certificate.usecase';
import { FakeCertificateVaultProvider } from '../mock/fake-certificate-vault.provider';
import { FakeOrganizationCompanyCertificateRepository } from '../mock/fake-organization-company-certificate.repository';
import { FakeOrganizationCompanyRepository } from '../mock/fake-organization-company.repository';

const VALID_CNPJ = '04252011000110';

async function seedCompany(
  companyRepository: FakeOrganizationCompanyRepository,
  organizationId: string,
) {
  const company = new OrganizationCompany({
    organizationId,
    cnpj: VALID_CNPJ,
    razaoSocial: 'Empresa Teste LTDA',
    status: 'active',
  });
  await companyRepository.create(company);
  return company;
}

function seedCertificate(
  repository: FakeOrganizationCompanyCertificateRepository,
  data: {
    organizationId: string;
    companyId: string;
    status?: 'active' | 'inactive';
    name?: string;
  },
) {
  const certificate = new OrganizationCompanyCertificate({
    organizationId: data.organizationId,
    companyId: data.companyId,
    name: data.name ?? 'Cert A',
    status: data.status ?? 'inactive',
    keyVaultCertName: `company-${data.companyId.slice(0, 8)}-cert-a`,
    keyVaultCertId: 'https://vault.example.com/certificates/a/v1',
    keyVaultKeyId: 'https://vault.example.com/keys/a/v1',
    passwordSecretName: 'company-cert-a-password',
    passwordSecretId: 'https://vault.example.com/secrets/a-password/v1',
    thumbprint: 'abc123',
    subject: 'CN=Test',
    issuer: 'CN=Issuer',
    expiresAt: new Date('2030-01-01'),
  });

  return repository.create(certificate);
}

describe('Organization company certificates', () => {
  const organizationId = '11111111-1111-1111-1111-111111111111';

  describe('ListOrganizationCompanyCertificates', () => {
    it('lists certificates for a company', async () => {
      const companyRepository = new FakeOrganizationCompanyRepository();
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const company = await seedCompany(companyRepository, organizationId);
      await seedCertificate(certificateRepository, {
        organizationId,
        companyId: company.id,
      });

      const useCase = new ListOrganizationCompanyCertificates(
        companyRepository,
        certificateRepository,
      );

      const result = await useCase.execute({
        organizationId,
        companyId: company.id,
      });

      expect(result.total).toBe(1);
      expect(result.items[0]?.name).toBe('Cert A');
    });

    it('rejects when company does not belong to organization', async () => {
      const useCase = new ListOrganizationCompanyCertificates(
        new FakeOrganizationCompanyRepository(),
        new FakeOrganizationCompanyCertificateRepository(),
      );

      await expect(
        useCase.execute({
          organizationId,
          companyId: 'missing-company',
        }),
      ).rejects.toThrow('Empresa não encontrada');
    });
  });

  describe('GetOrganizationCompanyCertificate', () => {
    it('returns certificate scoped by organization and company', async () => {
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const companyId = '22222222-2222-2222-2222-222222222222';
      const created = await seedCertificate(certificateRepository, {
        organizationId,
        companyId,
      });

      const useCase = new GetOrganizationCompanyCertificate(
        certificateRepository,
      );

      const certificate = await useCase.execute({
        organizationId,
        companyId,
        certificateId: created.id,
      });

      expect(certificate.id).toBe(created.id);
    });
  });

  describe('UploadOrganizationCompanyCertificate', () => {
    let tlsSpy: jest.SpyInstance;

    beforeEach(() => {
      tlsSpy = jest
        .spyOn(tls, 'createSecureContext')
        .mockImplementation(() => ({}) as tls.SecureContext);
    });

    afterEach(() => {
      tlsSpy.mockRestore();
    });

    it('uploads certificate and stores metadata', async () => {
      const companyRepository = new FakeOrganizationCompanyRepository();
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const vaultProvider = new FakeCertificateVaultProvider();
      const company = await seedCompany(companyRepository, organizationId);

      const useCase = new UploadOrganizationCompanyCertificate(
        companyRepository,
        certificateRepository,
        vaultProvider,
      );

      const certificate = await useCase.execute({
        organizationId,
        companyId: company.id,
        buffer: Buffer.from('pfx-content'),
        password: 'secret',
        name: 'Certificado Principal',
        status: 'inactive',
      });

      expect(certificate.name).toBe('Certificado Principal');
      expect(certificate.status).toBe('inactive');
      expect(vaultProvider.imports).toHaveLength(1);
      expect(vaultProvider.imports[0]?.password).toBe('secret');
    });

    it('deactivates existing active certificate when uploading as active', async () => {
      const companyRepository = new FakeOrganizationCompanyRepository();
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const vaultProvider = new FakeCertificateVaultProvider();
      const company = await seedCompany(companyRepository, organizationId);
      const existing = await seedCertificate(certificateRepository, {
        organizationId,
        companyId: company.id,
        status: 'active',
        name: 'Old Active',
      });

      const useCase = new UploadOrganizationCompanyCertificate(
        companyRepository,
        certificateRepository,
        vaultProvider,
      );

      const uploaded = await useCase.execute({
        organizationId,
        companyId: company.id,
        buffer: Buffer.from('pfx-content'),
        password: 'secret',
        status: 'active',
      });

      const oldCertificate = await certificateRepository.findById(existing.id);
      expect(oldCertificate?.status).toBe('inactive');
      expect(uploaded.status).toBe('active');
    });
  });

  describe('UpdateOrganizationCompanyCertificate', () => {
    it('activates certificate and deactivates others', async () => {
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const companyId = '33333333-3333-3333-3333-333333333333';
      const active = await seedCertificate(certificateRepository, {
        organizationId,
        companyId,
        status: 'active',
        name: 'Active Cert',
      });
      const inactive = await seedCertificate(certificateRepository, {
        organizationId,
        companyId,
        status: 'inactive',
        name: 'Inactive Cert',
      });

      const useCase = new UpdateOrganizationCompanyCertificate(
        certificateRepository,
      );

      const updated = await useCase.execute({
        organizationId,
        companyId,
        certificateId: inactive.id,
        status: 'active',
      });

      const previousActive = await certificateRepository.findById(active.id);
      expect(previousActive?.status).toBe('inactive');
      expect(updated.status).toBe('active');
    });
  });

  describe('RemoveOrganizationCompanyCertificate', () => {
    it('soft deletes certificate and removes secrets from vault', async () => {
      const certificateRepository =
        new FakeOrganizationCompanyCertificateRepository();
      const vaultProvider = new FakeCertificateVaultProvider();
      const companyId = '44444444-4444-4444-4444-444444444444';
      const certificate = await seedCertificate(certificateRepository, {
        organizationId,
        companyId,
      });

      const useCase = new RemoveOrganizationCompanyCertificate(
        certificateRepository,
        vaultProvider,
      );

      await useCase.execute({
        organizationId,
        companyId,
        certificateId: certificate.id,
      });

      const removed = await certificateRepository.findById(certificate.id);
      expect(removed).toBeNull();
      expect(vaultProvider.deletedCertificates).toContain(
        certificate.keyVaultCertName,
      );
      expect(vaultProvider.deletedSecrets).toContain(
        certificate.passwordSecretName,
      );
    });
  });
});
