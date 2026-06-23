import { Injectable } from '@nestjs/common';
import {
  OrganizationCompanyCertificate,
  OrganizationCompanyCertificatePageParams,
  OrganizationCompanyCertificateRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationCompanyCertificateRepository
  implements OrganizationCompanyCertificateRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(
    data: OrganizationCompanyCertificate,
  ): Promise<OrganizationCompanyCertificate> {
    const record = await this.prisma.organizationCompanyCertificate.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(
    data: OrganizationCompanyCertificate,
  ): Promise<OrganizationCompanyCertificate> {
    const record = await this.prisma.organizationCompanyCertificate.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organizationCompanyCertificate.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<OrganizationCompanyCertificate | null> {
    const record = await this.prisma.organizationCompanyCertificate.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate[]> {
    const records = await this.prisma.organizationCompanyCertificate.findMany({
      where: { company_id: companyId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findActiveByCompanyId(
    companyId: string,
  ): Promise<OrganizationCompanyCertificate | null> {
    const record = await this.prisma.organizationCompanyCertificate.findFirst({
      where: {
        company_id: companyId,
        status: 'active',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    return record ? this.toDomain(record) : null;
  }

  async deactivateAllByCompanyId(
    companyId: string,
    exceptId?: string,
  ): Promise<void> {
    await this.prisma.organizationCompanyCertificate.updateMany({
      where: {
        company_id: companyId,
        status: 'active',
        deleted_at: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { status: 'inactive' },
    });
  }

  async findPage(
    params: OrganizationCompanyCertificatePageParams,
  ): Promise<PageResult<OrganizationCompanyCertificate>> {
    const where: Prisma.OrganizationCompanyCertificateWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      company_id: params.companyId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organizationCompanyCertificate.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.organizationCompanyCertificate.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: OrganizationCompanyCertificate,
  ): Prisma.OrganizationCompanyCertificateUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      company_id: data.companyId,
      name: data.name ?? null,
      description: data.description ?? null,
      status: data.status,
      key_vault_cert_name: data.keyVaultCertName,
      key_vault_cert_id: data.keyVaultCertId,
      key_vault_key_id: data.keyVaultKeyId ?? null,
      password_secret_name: data.passwordSecretName ?? null,
      password_secret_id: data.passwordSecretId ?? null,
      thumbprint: data.thumbprint ?? null,
      subject: data.subject ?? null,
      issuer: data.issuer ?? null,
      expires_at: data.expiresAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    company_id: string;
    name: string | null;
    description: string | null;
    status: 'active' | 'inactive' | 'expired' | 'revoked';
    key_vault_cert_name: string;
    key_vault_cert_id: string;
    key_vault_key_id: string | null;
    password_secret_name: string | null;
    password_secret_id: string | null;
    thumbprint: string | null;
    subject: string | null;
    issuer: string | null;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): OrganizationCompanyCertificate {
    return new OrganizationCompanyCertificate({
      id: record.id,
      organizationId: record.organization_id,
      companyId: record.company_id,
      name: record.name,
      description: record.description,
      status: record.status,
      keyVaultCertName: record.key_vault_cert_name,
      keyVaultCertId: record.key_vault_cert_id,
      keyVaultKeyId: record.key_vault_key_id,
      passwordSecretName: record.password_secret_name,
      passwordSecretId: record.password_secret_id,
      thumbprint: record.thumbprint,
      subject: record.subject,
      issuer: record.issuer,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
