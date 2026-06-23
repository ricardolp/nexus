import { Injectable } from '@nestjs/common';
import {
  FiscalNfeSapDocumentStatus,
  FiscalNfeSapDocumentType,
  NfeSapDocument,
  NfeSapDocumentPageParams,
  NfeSapDocumentRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeSapDocumentRecord = {
  id: string;
  document_id: string;
  item_id: string | null;
  document_type: FiscalNfeSapDocumentType;
  doc_number: string;
  item_number: string | null;
  fiscal_year: string | null;
  status: FiscalNfeSapDocumentStatus;
  raw_response: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeSapDocumentRepository implements NfeSapDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeSapDocument): Promise<NfeSapDocument> {
    const record = await this.prisma.fiscalNfeSapDocument.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeSapDocument): Promise<NfeSapDocument> {
    const record = await this.prisma.fiscalNfeSapDocument.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeSapDocument.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeSapDocument | null> {
    const record = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentIdAndType(
    documentId: string,
    documentType: FiscalNfeSapDocumentType,
  ): Promise<NfeSapDocument[]> {
    const records = await this.prisma.fiscalNfeSapDocument.findMany({
      where: {
        document_id: documentId,
        document_type: documentType,
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfeSapDocumentPageParams,
  ): Promise<PageResult<NfeSapDocument>> {
    const where: Prisma.FiscalNfeSapDocumentWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeSapDocument.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeSapDocument.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeSapDocument,
  ): Prisma.FiscalNfeSapDocumentUncheckedCreateInput {
    return {
      id: data.id,
      document_id: data.documentId,
      item_id: data.itemId ?? null,
      document_type: data.documentType,
      doc_number: data.docNumber,
      item_number: data.itemNumber ?? null,
      fiscal_year: data.fiscalYear ?? null,
      status: data.status,
      raw_response: (data.rawResponse ?? null) as Prisma.InputJsonValue,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfeSapDocumentRecord): NfeSapDocument {
    return new NfeSapDocument({
      id: record.id,
      documentId: record.document_id,
      itemId: record.item_id,
      documentType: record.document_type,
      docNumber: record.doc_number,
      itemNumber: record.item_number,
      fiscalYear: record.fiscal_year,
      status: record.status,
      rawResponse:
        (record.raw_response as Record<string, unknown> | null) ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
