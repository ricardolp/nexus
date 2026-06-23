import { Injectable } from '@nestjs/common';
import {
  OrganizationCompany,
  OrganizationCompanyPageParams,
  OrganizationCompanyRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationCompanyRepository
  implements OrganizationCompanyRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: OrganizationCompany): Promise<OrganizationCompany> {
    const record = await this.prisma.organizationCompany.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: OrganizationCompany): Promise<OrganizationCompany> {
    const record = await this.prisma.organizationCompany.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organizationCompany.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<OrganizationCompany | null> {
    const record = await this.prisma.organizationCompany.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByCnpj(cnpj: string): Promise<OrganizationCompany | null> {
    const record = await this.prisma.organizationCompany.findFirst({
      where: { cnpj, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: OrganizationCompanyPageParams,
  ): Promise<PageResult<OrganizationCompany>> {
    const where: Prisma.OrganizationCompanyWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organizationCompany.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.organizationCompany.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: OrganizationCompany,
  ): Prisma.OrganizationCompanyUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      cnpj: data.cnpj,
      razao_social: data.razaoSocial,
      status: data.status,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    cnpj: string;
    razao_social: string;
    status: 'active' | 'inactive';
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): OrganizationCompany {
    return new OrganizationCompany({
      id: record.id,
      organizationId: record.organization_id,
      cnpj: record.cnpj,
      razaoSocial: record.razao_social,
      status: record.status,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
