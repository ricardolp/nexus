import {
  CertificateImportResult,
  CertificateVaultProvider,
} from '../../src/organization-company-certificate/provider';

export class FakeCertificateVaultProvider implements CertificateVaultProvider {
  readonly imports: Array<{
    certName: string;
    buffer: Buffer;
    password: string;
  }> = [];
  readonly deletedCertificates: string[] = [];
  readonly deletedSecrets: string[] = [];

  async importPfx(
    certName: string,
    buffer: Buffer,
    password: string,
  ): Promise<CertificateImportResult> {
    this.imports.push({ certName, buffer, password });

    return {
      certName,
      certId: `https://vault.example.com/certificates/${certName}/v1`,
      keyId: `https://vault.example.com/keys/${certName}/v1`,
      passwordSecretName: `${certName}-password`,
      passwordSecretId: `https://vault.example.com/secrets/${certName}-password/v1`,
      thumbprint: 'abc123',
      subject: 'CN=Test',
      issuer: 'CN=Issuer',
      expiresAt: new Date('2030-01-01'),
    };
  }

  async deleteCertificate(certName: string): Promise<void> {
    this.deletedCertificates.push(certName);
  }

  async deleteSecret(secretName: string): Promise<void> {
    this.deletedSecrets.push(secretName);
  }
}
