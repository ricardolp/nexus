import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CertificateClient } from '@azure/keyvault-certificates';
import { KeyClient } from '@azure/keyvault-keys';
import { SecretClient } from '@azure/keyvault-secrets';
import { ClientSecretCredential } from '@azure/identity';
import { ValidationError } from '@nexus/shared';
import {
  CertificateImportResult,
  CertificateVaultProvider,
} from '@nexus/organization';

@Injectable()
export class AzureKeyVaultCertificateProvider
  implements CertificateVaultProvider
{
  private readonly logger = new Logger(AzureKeyVaultCertificateProvider.name);
  private readonly vaultUrl: string;
  private readonly certificateClient: CertificateClient;
  private readonly secretClient: SecretClient;
  private readonly keyClient: KeyClient;

  constructor(private readonly configService: ConfigService) {
    this.vaultUrl = this.requireConfig('AZURE_KEY_VAULT_URL');
    const tenantId = this.requireConfig('AZURE_TENANT_ID');
    const clientId = this.requireConfig('AZURE_CLIENT_ID');
    const clientSecret = this.requireConfig('AZURE_CLIENT_SECRET');

    const credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret,
    );

    this.certificateClient = new CertificateClient(this.vaultUrl, credential);
    this.secretClient = new SecretClient(this.vaultUrl, credential);
    this.keyClient = new KeyClient(this.vaultUrl, credential);
  }

  async importPfx(
    certName: string,
    buffer: Buffer,
    password: string,
  ): Promise<CertificateImportResult> {
    try {
      const importResult = await this.certificateClient.importCertificate(
        certName,
        buffer,
        {
          password,
        },
      );

      const certId =
        importResult.id ??
        `${this.vaultUrl}/certificates/${importResult.name}/${importResult.properties.version}`;

      const key = await this.keyClient.getKey(certName);
      const keyId = key.key?.kid
        ? String(key.key.kid).replace(/`/g, '').trim()
        : null;

      const secretName = `${certName}-password`;
      const secretResult = await this.secretClient.setSecret(secretName, password);
      const secretId =
        secretResult.properties.id ??
        (secretResult.properties.version
          ? `${this.vaultUrl}/secrets/${secretResult.name}/${secretResult.properties.version}`
          : null);

      return {
        certName: importResult.name ?? certName,
        certId,
        keyId,
        passwordSecretName: secretResult.name ?? secretName,
        passwordSecretId: secretId,
        thumbprint: importResult.properties.x509Thumbprint
          ? Buffer.from(importResult.properties.x509Thumbprint).toString('hex')
          : null,
        subject: importResult.policy?.subject ?? null,
        issuer: importResult.policy?.issuerName ?? null,
        expiresAt: importResult.properties.expiresOn ?? null,
      };
    } catch (error) {
      this.logger.error('Failed to import certificate into Azure Key Vault', error);
      throw new ValidationError(this.toUserMessage(error));
    }
  }

  async deleteCertificate(certName: string): Promise<void> {
    const poller = await this.certificateClient.beginDeleteCertificate(certName);
    await poller.pollUntilDone();
  }

  async deleteSecret(secretName: string): Promise<void> {
    const poller = await this.secretClient.beginDeleteSecret(secretName);
    await poller.pollUntilDone();
  }

  async storeNamedSecret(
    secretName: string,
    value: string,
  ): Promise<{ secretName: string; secretId: string | null }> {
    try {
      const secretResult = await this.secretClient.setSecret(secretName, value);
      return {
        secretName: secretResult.name ?? secretName,
        secretId:
          secretResult.properties.id ??
          (secretResult.properties.version
            ? `${this.vaultUrl}/secrets/${secretResult.name}/${secretResult.properties.version}`
            : null),
      };
    } catch (error) {
      this.logger.error('Failed to store secret in Azure Key Vault', error);
      throw new ValidationError(this.toUserMessage(error));
    }
  }

  private requireConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }

    return value;
  }

  private toUserMessage(error: unknown): string {
    if (typeof error !== 'object' || error === null) {
      return 'Falha ao importar certificado no Azure Key Vault';
    }

    const candidate = error as {
      message?: string;
      code?: string;
      statusCode?: number;
    };

    const message = candidate.message ?? '';
    const code = candidate.code ?? '';

    if (/expired/i.test(message) || /AADSTS7000222/i.test(message)) {
      return 'O segredo do aplicativo Azure (AZURE_CLIENT_SECRET) expirou. Renove no portal Azure ou habilite SAP_INTEGRATION_LOCAL_SECRETS=true para desenvolvimento local.';
    }

    if (this.isAuthorizationError(candidate.statusCode, code, message)) {
      return 'Sem permissão para gravar certificados no Azure Key Vault. Conceda ao aplicativo permissões de certificados, chaves e segredos no vault.';
    }

    const sanitized = this.sanitizeAzureMessage(message);
    if (sanitized) {
      return sanitized;
    }

    return 'Falha ao importar certificado no Azure Key Vault';
  }

  private isAuthorizationError(
    statusCode: number | undefined,
    code: string,
    message: string,
  ): boolean {
    return (
      statusCode === 403 ||
      code === 'Forbidden' ||
      code === 'AuthorizationFailed' ||
      /not authorized/i.test(message) ||
      /AuthorizationFailed/i.test(message)
    );
  }

  private sanitizeAzureMessage(message: string): string | null {
    if (!message) {
      return null;
    }

    const withoutMeta = message
      .split('Correlation ID:')[0]
      ?.split('Trace ID:')[0]
      ?.trim();

    if (!withoutMeta) {
      return null;
    }

    if (this.isAuthorizationError(undefined, '', withoutMeta)) {
      return 'Sem permissão para gravar certificados no Azure Key Vault. Conceda ao aplicativo permissões de certificados, chaves e segredos no vault.';
    }

    return withoutMeta.replace(/\s+/g, ' ').trim();
  }
}
