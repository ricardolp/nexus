import { Injectable } from '@nestjs/common';
import {
  FiscalNfeAttachmentKind,
  NfeDocumentAttachment,
  NfeDocumentAttachmentPageParams,
  NfeDocumentAttachmentRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeDocumentAttachmentRecord = {
  id: string;
  document_id: string;
  event_id: string | null;
  kind: FiscalNfeAttachmentKind;
  file_name: string;
  content_type: string | null;
  storage_key: string;
  content: string | null;
  size_bytes: bigint | null;
  checksum_sha256: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeDocumentAttachmentRepository
  implements NfeDocumentAttachmentRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeDocumentAttachment): Promise<NfeDocumentAttachment> {
    const record = await this.prisma.fiscalNfeDocumentAttachment.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeDocumentAttachment): Promise<NfeDocumentAttachment> {
    const record = await this.prisma.fiscalNfeDocumentAttachment.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeDocumentAttachment.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeDocumentAttachment | null> {
    const record = await this.prisma.fiscalNfeDocumentAttachment.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(
    documentId: string,
  ): Promise<NfeDocumentAttachment[]> {
    const records = await this.prisma.fiscalNfeDocumentAttachment.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByEventId(eventId: string): Promise<NfeDocumentAttachment[]> {
    const records = await this.prisma.fiscalNfeDocumentAttachment.findMany({
      where: { event_id: eventId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfeDocumentAttachmentPageParams,
  ): Promise<PageResult<NfeDocumentAttachment>> {
    const where: Prisma.FiscalNfeDocumentAttachmentWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
      ...(params.eventId ? { event_id: params.eventId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocumentAttachment.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeDocumentAttachment.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeDocumentAttachment,
  ): Prisma.FiscalNfeDocumentAttachmentUncheckedCreateInput {
    return {
      id: data.id,
      document_id: data.documentId,
      event_id: data.eventId ?? null,
      kind: data.kind,
      file_name: data.fileName,
      content_type: data.contentType ?? null,
      storage_key: data.storageKey,
      content: data.content ?? null,
      size_bytes:
        data.sizeBytes != null ? BigInt(data.sizeBytes) : null,
      checksum_sha256: data.checksumSha256 ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(
    record: FiscalNfeDocumentAttachmentRecord,
  ): NfeDocumentAttachment {
    return new NfeDocumentAttachment({
      id: record.id,
      documentId: record.document_id,
      eventId: record.event_id,
      kind: record.kind,
      fileName: record.file_name,
      contentType: record.content_type,
      storageKey: record.storage_key,
      content: record.content,
      sizeBytes:
        record.size_bytes != null ? Number(record.size_bytes) : null,
      checksumSha256: record.checksum_sha256,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
