import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretClient } from '@azure/keyvault-secrets';
import { ClientSecretCredential } from '@azure/identity';
import { ValidationError } from '@nexus/shared';
import { PrismaService } from '../../../db/prisma.service';
import { SAP_INTEGRATION_LOCAL_SECRET_MARKER } from '../../organization/sap-integration-secret.util';

export type SapCredentials = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  sapClient: string;
  sapLanguage: string;
};

export type SapIntegrationPaths = {
  purchaseOrders: string;
  inboundDelivery: string;
  miro: string;
};

@Injectable()
export class SapIntegrationConfigService {
  private secretClient: SecretClient | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  shouldUseMock(): boolean {
    const raw =
      process.env.SAP_MOCK_PO ??
      this.configService.get<string>('SAP_MOCK_PO');
    return String(raw ?? 'false').toLowerCase() === 'true';
  }

  getPaths(): SapIntegrationPaths {
    return {
      purchaseOrders:
        this.configService.get<string>('SAP_PATH_PURCHASE_ORDERS') ??
        '/http/PurchaseOrders',
      inboundDelivery:
        this.configService.get<string>('SAP_PATH_INBOUND_DELIVERY') ??
        '/http/InboundDelivery',
      miro:
        this.configService.get<string>('SAP_PATH_MIRO') ?? '/http/InboundMiro',
    };
  }

  getDefaultSapClient(): string {
    return this.configService.get<string>('SAP_DEFAULT_CLIENT') ?? '310';
  }

  getDefaultSapLanguage(): string {
    return this.configService.get<string>('SAP_DEFAULT_LANGUAGE') ?? 'PT';
  }

  async isIntegrationConfigured(organizationId: string): Promise<boolean> {
    if (this.shouldUseMock()) return true;
    const row = await this.prisma.organizationSettings.findUnique({
      where: { organization_id: organizationId },
    });
    return Boolean(
      row?.integration_base_url?.trim() &&
        row?.integration_client_id?.trim() &&
        (row?.integration_secret_key_vault_name?.trim() ||
          row?.integration_client_secret_local?.trim()),
    );
  }

  async getCredentials(organizationId: string): Promise<SapCredentials> {
    const row = await this.prisma.organizationSettings.findUnique({
      where: { organization_id: organizationId },
    });

    if (
      !row?.integration_base_url?.trim() ||
      !row?.integration_client_id?.trim() ||
      (!row?.integration_secret_key_vault_name?.trim() &&
        !row?.integration_client_secret_local?.trim())
    ) {
      throw new ValidationError('integration_not_configured');
    }

    const clientSecret = await this.resolveClientSecret(row);

    return {
      baseUrl: row.integration_base_url.trim(),
      clientId: row.integration_client_id.trim(),
      clientSecret,
      sapClient: row.sap_client?.trim() || this.getDefaultSapClient(),
      sapLanguage: row.sap_language?.trim() || this.getDefaultSapLanguage(),
    };
  }

  buildUrl(
    credentials: SapCredentials,
    path: string,
    query?: URLSearchParams,
  ): string {
    const normalizedBase = credentials.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(
      path.trim() && path !== '/'
        ? `${normalizedBase}${normalizedPath}`
        : normalizedBase,
    );
    url.searchParams.set('sap-client', credentials.sapClient);
    if (query) {
      for (const [key, value] of query.entries()) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  /** CPI base URL from org settings with sap-client query param only. */
  buildCpiBaseUrl(credentials: SapCredentials): string {
    const url = new URL(credentials.baseUrl);
    url.searchParams.set('sap-client', credentials.sapClient);
    return url.toString();
  }

  /** CPI base URL with arbitrary query params (e.g. purchase order lookup). */
  buildCpiUrl(credentials: SapCredentials, query: URLSearchParams): string {
    const url = new URL(credentials.baseUrl);
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private async resolveClientSecret(row: {
    integration_secret_key_vault_name: string | null;
    integration_client_secret_local: string | null;
  }): Promise<string> {
    if (
      row.integration_secret_key_vault_name ===
        SAP_INTEGRATION_LOCAL_SECRET_MARKER &&
      row.integration_client_secret_local?.trim()
    ) {
      return row.integration_client_secret_local.trim();
    }

    if (!row.integration_secret_key_vault_name?.trim()) {
      throw new ValidationError('integration_not_configured');
    }

    return this.getSecret(row.integration_secret_key_vault_name);
  }

  private async getSecret(secretName: string): Promise<string> {
    const client = this.getSecretClient();
    const secret = await client.getSecret(secretName);
    if (!secret.value?.trim()) {
      throw new ValidationError('integration_not_configured');
    }
    return secret.value.trim();
  }

  private getSecretClient(): SecretClient {
    if (this.secretClient) return this.secretClient;

    const vaultUrl = this.configService.get<string>('AZURE_KEY_VAULT_URL');
    const tenantId = this.configService.get<string>('AZURE_TENANT_ID');
    const clientId = this.configService.get<string>('AZURE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('AZURE_CLIENT_SECRET');

    if (!vaultUrl || !tenantId || !clientId || !clientSecret) {
      throw new ValidationError('key_vault_error');
    }

    const credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret,
    );
    this.secretClient = new SecretClient(vaultUrl, credential);
    return this.secretClient;
  }
}
