import { Injectable } from '@nestjs/common';
import {
  OrganizationRole,
  OrganizationRolePageParams,
  OrganizationRoleRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationRoleRepository
  implements OrganizationRoleRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: OrganizationRole): Promise<OrganizationRole> {
    const record = await this.prisma.organizationRole.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: OrganizationRole): Promise<OrganizationRole> {
    const record = await this.prisma.organizationRole.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organizationRole.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<OrganizationRole | null> {
    const record = await this.prisma.organizationRole.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByOrganizationAndSlug(
    organizationId: string,
    slug: string,
  ): Promise<OrganizationRole | null> {
    const record = await this.prisma.organizationRole.findFirst({
      where: {
        organization_id: organizationId,
        slug,
        deleted_at: null,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: OrganizationRolePageParams,
  ): Promise<PageResult<OrganizationRole>> {
    const where: Prisma.OrganizationRoleWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organizationRole.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.organizationRole.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: OrganizationRole,
  ): Prisma.OrganizationRoleUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      nome: data.nome,
      slug: data.slug,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    nome: string;
    slug: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): OrganizationRole {
    return new OrganizationRole({
      id: record.id,
      organizationId: record.organization_id,
      nome: record.nome,
      slug: record.slug,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
