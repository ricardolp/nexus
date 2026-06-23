import { Injectable } from '@nestjs/common';
import {
  FiscalNfseTimelineSource,
  NfseDocumentTimeline,
  NfseDocumentTimelinePageParams,
  NfseDocumentTimelineRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseDocumentTimelineRecord = {
  id: string;
  document_id: string;
  event_id: string | null;
  source: FiscalNfseTimelineSource;
  title: string;
  message: string | null;
  metadata: Prisma.JsonValue | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseDocumentTimelineRepository
  implements NfseDocumentTimelineRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseDocumentTimeline): Promise<NfseDocumentTimeline> {
    const record = await this.prisma.fiscalNfseDocumentTimeline.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseDocumentTimeline): Promise<NfseDocumentTimeline> {
    const record = await this.prisma.fiscalNfseDocumentTimeline.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseDocumentTimeline.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseDocumentTimeline | null> {
    const record = await this.prisma.fiscalNfseDocumentTimeline.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(
    documentId: string,
  ): Promise<NfseDocumentTimeline[]> {
    const records = await this.prisma.fiscalNfseDocumentTimeline.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfseDocumentTimelinePageParams,
  ): Promise<PageResult<NfseDocumentTimeline>> {
    const where: Prisma.FiscalNfseDocumentTimelineWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseDocumentTimeline.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseDocumentTimeline.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseDocumentTimeline,
  ): Prisma.FiscalNfseDocumentTimelineUncheckedCreateInput {
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
    record: FiscalNfseDocumentTimelineRecord,
  ): NfseDocumentTimeline {
    return new NfseDocumentTimeline({
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
