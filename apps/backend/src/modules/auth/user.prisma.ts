import { Injectable } from '@nestjs/common';
import { User, UserPageParams, UserRepository } from '@nexus/auth';
import { Prisma, user_role } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: User): Promise<User> {
    const record = await this.prisma.user.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: User): Promise<User> {
    const record = await this.prisma.user.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await this.prisma.user.findFirst({
      where: { email, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(params: UserPageParams): Promise<PageResult<User>> {
    const where: Prisma.UserWhereInput = { deleted_at: null };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(data: User): Prisma.UserUncheckedCreateInput {
    return {
      id: data.id,
      nome: data.nome,
      sobrenome: data.sobrenome,
      email: data.email,
      senha: data.senha,
      email_confirmado_em: data.emailConfirmadoEm ?? null,
      role: data.role as user_role,
      ultimo_login_em: data.ultimoLoginEm ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    nome: string;
    sobrenome: string;
    email: string;
    senha: string;
    email_confirmado_em: Date | null;
    role: user_role;
    ultimo_login_em: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): User {
    return new User({
      id: record.id,
      nome: record.nome,
      sobrenome: record.sobrenome,
      email: record.email,
      senha: record.senha,
      emailConfirmadoEm: record.email_confirmado_em,
      role: record.role,
      ultimoLoginEm: record.ultimo_login_em,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
