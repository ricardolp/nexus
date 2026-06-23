import { Injectable } from '@nestjs/common';
import {
  FiscalNfseAttachmentKind,
  NfseDocumentAttachment,
  NfseDocumentAttachmentPageParams,
  NfseDocumentAttachmentRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseDocumentAttachmentRecord = {
  id: string;
  document_id: string;
  event_id: string | null;
  kind: FiscalNfseAttachmentKind;
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
export class PrismaNfseDocumentAttachmentRepository
  implements NfseDocumentAttachmentRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseDocumentAttachment): Promise<NfseDocumentAttachment> {
    const record = await this.prisma.fiscalNfseDocumentAttachment.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseDocumentAttachment): Promise<NfseDocumentAttachment> {
    const record = await this.prisma.fiscalNfseDocumentAttachment.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseDocumentAttachment.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseDocumentAttachment | null> {
    const record = await this.prisma.fiscalNfseDocumentAttachment.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(
    documentId: string,
  ): Promise<NfseDocumentAttachment[]> {
    const records = await this.prisma.fiscalNfseDocumentAttachment.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findByEventId(eventId: string): Promise<NfseDocumentAttachment[]> {
    const records = await this.prisma.fiscalNfseDocumentAttachment.findMany({
      where: { event_id: eventId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfseDocumentAttachmentPageParams,
  ): Promise<PageResult<NfseDocumentAttachment>> {
    const where: Prisma.FiscalNfseDocumentAttachmentWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
      ...(params.eventId ? { event_id: params.eventId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseDocumentAttachment.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseDocumentAttachment.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseDocumentAttachment,
  ): Prisma.FiscalNfseDocumentAttachmentUncheckedCreateInput {
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
    record: FiscalNfseDocumentAttachmentRecord,
  ): NfseDocumentAttachment {
    return new NfseDocumentAttachment({
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
