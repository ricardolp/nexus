import { Injectable } from '@nestjs/common';
import {
  FiscalNfeTimelineSource,
  NfeDocumentTimeline,
  NfeDocumentTimelinePageParams,
  NfeDocumentTimelineRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeDocumentTimelineRecord = {
  id: string;
  document_id: string;
  event_id: string | null;
  source: FiscalNfeTimelineSource;
  title: string;
  message: string | null;
  metadata: Prisma.JsonValue | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeDocumentTimelineRepository
  implements NfeDocumentTimelineRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeDocumentTimeline): Promise<NfeDocumentTimeline> {
    const record = await this.prisma.fiscalNfeDocumentTimeline.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeDocumentTimeline): Promise<NfeDocumentTimeline> {
    const record = await this.prisma.fiscalNfeDocumentTimeline.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeDocumentTimeline.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeDocumentTimeline | null> {
    const record = await this.prisma.fiscalNfeDocumentTimeline.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(documentId: string): Promise<NfeDocumentTimeline[]> {
    const records = await this.prisma.fiscalNfeDocumentTimeline.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfeDocumentTimelinePageParams,
  ): Promise<PageResult<NfeDocumentTimeline>> {
    const where: Prisma.FiscalNfeDocumentTimelineWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocumentTimeline.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeDocumentTimeline.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeDocumentTimeline,
  ): Prisma.FiscalNfeDocumentTimelineUncheckedCreateInput {
    return {
      id: data.id,
      document_id: data.documentId,
      event_id: data.eventId ?? null,
      source: data.source,
      title: data.title,
      message: data.message ?? null,
      metadata: (data.metadata ?? null) as Prisma.InputJsonValue,
      created_by_user_id: data.createdByUserId ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(
    record: FiscalNfeDocumentTimelineRecord,
  ): NfeDocumentTimeline {
    return new NfeDocumentTimeline({
      id: record.id,
      documentId: record.document_id,
      eventId: record.event_id,
      source: record.source,
      title: record.title,
      message: record.message,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      createdByUserId: record.created_by_user_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
