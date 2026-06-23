import { Injectable } from '@nestjs/common';
import {
  AuthToken,
  AuthTokenPageParams,
  AuthTokenRepository,
  AuthTokenType,
} from '@nexus/auth';
import { auth_token_type, Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaAuthTokenRepository implements AuthTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: AuthToken): Promise<AuthToken> {
    const record = await this.prisma.authToken.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: AuthToken): Promise<AuthToken> {
    const record = await this.prisma.authToken.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.authToken.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<AuthToken | null> {
    const record = await this.prisma.authToken.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<AuthToken | null> {
    const record = await this.prisma.authToken.findFirst({
      where: { token_hash: tokenHash, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findActiveByEmailAndType(
    email: string,
    tipo: AuthTokenType,
  ): Promise<AuthToken | null> {
    const record = await this.prisma.authToken.findFirst({
      where: {
        email,
        tipo: tipo as auth_token_type,
        deleted_at: null,
        used_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: AuthTokenPageParams,
  ): Promise<PageResult<AuthToken>> {
    const where: Prisma.AuthTokenWhereInput = { deleted_at: null };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.authToken.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.authToken.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(data: AuthToken): Prisma.AuthTokenUncheckedCreateInput {
    return {
      id: data.id,
      tipo: data.tipo as auth_token_type,
      email: data.email,
      user_id: data.userId ?? null,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt,
      used_at: data.usedAt ?? null,
      metadados: (data.metadados ?? null) as Prisma.InputJsonValue,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    tipo: auth_token_type;
    email: string;
    user_id: string | null;
    token_hash: string;
    expires_at: Date;
    used_at: Date | null;
    metadados: Prisma.JsonValue;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): AuthToken {
    return new AuthToken({
      id: record.id,
      tipo: record.tipo as AuthTokenType,
      email: record.email,
      userId: record.user_id,
      tokenHash: record.token_hash,
      expiresAt: record.expires_at,
      usedAt: record.used_at,
      metadados: (record.metadados as Record<string, unknown> | null) ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
