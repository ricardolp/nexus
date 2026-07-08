import { Injectable } from '@nestjs/common';
import {
  Organization,
  OrganizationPageParams,
  OrganizationRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Organization): Promise<Organization> {
    const record = await this.prisma.organization.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: Organization): Promise<Organization> {
    const record = await this.prisma.organization.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organization.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<Organization | null> {
    const record = await this.prisma.organization.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const record = await this.prisma.organization.findFirst({
      where: { slug, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: OrganizationPageParams,
  ): Promise<PageResult<Organization>> {
    const where: Prisma.OrganizationWhereInput = { deleted_at: null };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: Organization,
  ): Prisma.OrganizationUncheckedCreateInput {
    return {
      id: data.id,
      nome: data.nome,
      slug: data.slug,
      logo: data.logo ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    nome: string;
    slug: string;
    logo: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): Organization {
    return new Organization({
      id: record.id,
      nome: record.nome,
      slug: record.slug,
      logo: record.logo,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
