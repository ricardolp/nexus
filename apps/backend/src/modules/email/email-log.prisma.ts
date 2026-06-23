import { Injectable } from '@nestjs/common';
import {
  EmailLog,
  EmailLogPageParams,
  EmailLogRepository,
  EmailLogStatus,
  EmailTemplateType,
} from '@nexus/email';
import {
  email_log_status,
  email_template_type,
  Prisma,
} from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaEmailLogRepository implements EmailLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: EmailLog): Promise<EmailLog> {
    const record = await this.prisma.emailLog.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: EmailLog): Promise<EmailLog> {
    const record = await this.prisma.emailLog.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.emailLog.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<EmailLog | null> {
    const record = await this.prisma.emailLog.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: EmailLogPageParams,
  ): Promise<PageResult<EmailLog>> {
    const where: Prisma.EmailLogWhereInput = { deleted_at: null };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.emailLog.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.emailLog.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(data: EmailLog): Prisma.EmailLogUncheckedCreateInput {
    return {
      id: data.id,
      destinatario: data.destinatario,
      assunto: data.assunto,
      template: data.template as email_template_type,
      status: data.status as email_log_status,
      erro: data.erro ?? null,
      metadados: (data.metadados ?? null) as Prisma.InputJsonValue,
      enviado_em: data.enviadoEm ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    destinatario: string;
    assunto: string;
    template: email_template_type;
    status: email_log_status;
    erro: string | null;
    metadados: Prisma.JsonValue;
    enviado_em: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): EmailLog {
    return new EmailLog({
      id: record.id,
      destinatario: record.destinatario,
      assunto: record.assunto,
      template: record.template as EmailTemplateType,
      status: record.status as EmailLogStatus,
      erro: record.erro,
      metadados: (record.metadados as Record<string, unknown> | null) ?? null,
      enviadoEm: record.enviado_em,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
