import { Injectable } from '@nestjs/common';
import {
  IntegrationToken,
  IntegrationTokenPageParams,
  IntegrationTokenRepository,
} from '@nexus/integration';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaIntegrationTokenRepository
  implements IntegrationTokenRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: IntegrationToken): Promise<IntegrationToken> {
    const record = await this.prisma.integrationToken.create({
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async update(data: IntegrationToken): Promise<IntegrationToken> {
    const record = await this.prisma.integrationToken.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<IntegrationToken | null> {
    const record = await this.prisma.integrationToken.findFirst({
      where: { id, deleted_at: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<IntegrationToken | null> {
    const record = await this.prisma.integrationToken.findFirst({
      where: { token_hash: tokenHash, deleted_at: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: IntegrationTokenPageParams,
  ): Promise<PageResult<IntegrationToken>> {
    const where: Prisma.IntegrationTokenWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.integrationToken.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.integrationToken.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async touch(id: string): Promise<void> {
    await this.prisma.integrationToken.update({
      where: { id },
      data: { last_used_at: new Date() },
    });
  }

  private toPersistence(
    data: IntegrationToken,
  ): Prisma.IntegrationTokenUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      name: data.name,
      token_prefix: data.tokenPrefix,
      token_hash: data.tokenHash,
      scopes: data.scopes,
      created_by_user_id: data.createdByUserId,
      last_used_at: data.lastUsedAt ?? null,
      revoked_at: data.revokedAt ?? null,
      expires_at: data.expiresAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    name: string;
    token_prefix: string;
    token_hash: string;
    scopes: string[];
    created_by_user_id: string;
    last_used_at: Date | null;
    revoked_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): IntegrationToken {
    return new IntegrationToken({
      id: record.id,
      organizationId: record.organization_id,
      name: record.name,
      tokenPrefix: record.token_prefix,
      tokenHash: record.token_hash,
      scopes: record.scopes,
      createdByUserId: record.created_by_user_id,
      lastUsedAt: record.last_used_at,
      revokedAt: record.revoked_at,
      expiresAt: record.expires_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
