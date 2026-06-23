import { Injectable } from '@nestjs/common';
import {
  OrganizationMember,
  OrganizationMemberPageParams,
  OrganizationMemberRepository,
} from '@nexus/organization';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaOrganizationMemberRepository
  implements OrganizationMemberRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: OrganizationMember): Promise<OrganizationMember> {
    const record = await this.prisma.organizationMember.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: OrganizationMember): Promise<OrganizationMember> {
    const record = await this.prisma.organizationMember.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.organizationMember.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<OrganizationMember | null> {
    const record = await this.prisma.organizationMember.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByOrganizationAndUser(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMember | null> {
    const record = await this.prisma.organizationMember.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId,
        deleted_at: null,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByUserId(userId: string): Promise<OrganizationMember[]> {
    const records = await this.prisma.organizationMember.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: OrganizationMemberPageParams,
  ): Promise<PageResult<OrganizationMember>> {
    const where: Prisma.OrganizationMemberWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findPageWithRelations(
    params: OrganizationMemberPageParams,
  ): Promise<{
    items: Array<{
      member: OrganizationMember;
      user: { nome: string; sobrenome: string; email: string };
      role: { id: string; nome: string; slug: string };
    }>;
    page: number;
    perPage: number;
    total: number;
  }> {
    const where: Prisma.OrganizationMemberWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
        include: {
          user: {
            select: { nome: true, sobrenome: true, email: true },
          },
          role: {
            select: { id: true, nome: true, slug: true },
          },
        },
      }),
      this.prisma.organizationMember.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        member: this.toDomain(record),
        user: record.user,
        role: record.role,
      })),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: OrganizationMember,
  ): Prisma.OrganizationMemberUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      user_id: data.userId,
      role_id: data.roleId,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    user_id: string;
    role_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): OrganizationMember {
    return new OrganizationMember({
      id: record.id,
      organizationId: record.organization_id,
      userId: record.user_id,
      roleId: record.role_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
