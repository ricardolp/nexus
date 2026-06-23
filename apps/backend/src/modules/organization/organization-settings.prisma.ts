import { Injectable } from '@nestjs/common';
import {
  OrganizationSettings,
  OrganizationSettingsRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationSettingsRepository
  implements OrganizationSettingsRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: OrganizationSettings): Promise<OrganizationSettings> {
    const record = await this.prisma.organizationSettings.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: OrganizationSettings): Promise<OrganizationSettings> {
    const record = await this.prisma.organizationSettings.update({
      where: { organization_id: data.organizationId },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async findByOrganizationId(
    organizationId: string,
  ): Promise<OrganizationSettings | null> {
    const record = await this.prisma.organizationSettings.findUnique({
      where: { organization_id: organizationId },
    });

    return record ? this.toDomain(record) : null;
  }

  private toPersistence(
    data: OrganizationSettings,
  ): Prisma.OrganizationSettingsUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      max_companies: data.maxCompanies,
      integration_base_url: data.integrationBaseUrl ?? null,
      integration_client_id: data.integrationClientId ?? null,
      integration_secret_key_vault_name:
        data.integrationSecretKeyVaultName ?? null,
      integration_secret_key_vault_id:
        data.integrationSecretKeyVaultId ?? null,
      integration_client_secret_local:
        data.integrationClientSecretLocal ?? null,
      sap_client: data.sapClient ?? null,
      sap_language: data.sapLanguage ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    max_companies: number;
    integration_base_url: string | null;
    integration_client_id: string | null;
    integration_secret_key_vault_name: string | null;
    integration_secret_key_vault_id: string | null;
    integration_client_secret_local: string | null;
    sap_client: string | null;
    sap_language: string | null;
    created_at: Date;
    updated_at: Date;
  }): OrganizationSettings {
    return new OrganizationSettings({
      id: record.id,
      organizationId: record.organization_id,
      maxCompanies: record.max_companies,
      integrationBaseUrl: record.integration_base_url,
      integrationClientId: record.integration_client_id,
      integrationSecretKeyVaultName: record.integration_secret_key_vault_name,
      integrationSecretKeyVaultId: record.integration_secret_key_vault_id,
      integrationClientSecretLocal: record.integration_client_secret_local,
      sapClient: record.sap_client,
      sapLanguage: record.sap_language,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }
}
