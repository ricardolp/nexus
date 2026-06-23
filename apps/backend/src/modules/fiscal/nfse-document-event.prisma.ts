import { Injectable } from '@nestjs/common';
import {
  FiscalNfseEventStatus,
  FiscalNfseEventType,
  NfseDocumentEvent,
  NfseDocumentEventPageParams,
  NfseDocumentEventRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseDocumentEventRecord = {
  id: string;
  organization_id: string;
  document_id: string;
  event_type: FiscalNfseEventType;
  event_status: FiscalNfseEventStatus;
  sequence: number;
  prefeitura_status_code: string | null;
  prefeitura_status_message: string | null;
  protocol: string | null;
  correlation_id: string | null;
  request_summary: Prisma.JsonValue | null;
  response_summary: Prisma.JsonValue | null;
  error_code: string | null;
  error_message: string | null;
  triggered_by_user_id: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseDocumentEventRepository
  implements NfseDocumentEventRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseDocumentEvent): Promise<NfseDocumentEvent> {
    const record = await this.prisma.fiscalNfseDocumentEvent.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseDocumentEvent): Promise<NfseDocumentEvent> {
    const record = await this.prisma.fiscalNfseDocumentEvent.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseDocumentEvent.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseDocumentEvent | null> {
    const record = await this.prisma.fiscalNfseDocumentEvent.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: NfseDocumentEventPageParams,
  ): Promise<PageResult<NfseDocumentEvent>> {
    const where: Prisma.FiscalNfseDocumentEventWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      document_id: params.documentId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseDocumentEvent.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseDocumentEvent.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseDocumentEvent,
  ): Prisma.FiscalNfseDocumentEventUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      document_id: data.documentId,
      event_type: data.eventType,
      event_status: data.eventStatus,
      sequence: data.sequence,
      prefeitura_status_code: data.prefeituraStatusCode ?? null,
      prefeitura_status_message: data.prefeituraStatusMessage ?? null,
      protocol: data.protocol ?? null,
      correlation_id: data.correlationId ?? null,
      request_summary: (data.requestSummary ?? null) as Prisma.InputJsonValue,
      response_summary: (data.responseSummary ?? null) as Prisma.InputJsonValue,
      error_code: data.errorCode ?? null,
      error_message: data.errorMessage ?? null,
      triggered_by_user_id: data.triggeredByUserId ?? null,
      started_at: data.startedAt ?? null,
      completed_at: data.completedAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfseDocumentEventRecord): NfseDocumentEvent {
    return new NfseDocumentEvent({
      id: record.id,
      organizationId: record.organization_id,
      documentId: record.document_id,
      eventType: record.event_type,
      eventStatus: record.event_status,
      sequence: record.sequence,
      prefeituraStatusCode: record.prefeitura_status_code,
      prefeituraStatusMessage: record.prefeitura_status_message,
      protocol: record.protocol,
      correlationId: record.correlation_id,
      requestSummary:
        (record.request_summary as Record<string, unknown> | null) ?? null,
      responseSummary:
        (record.response_summary as Record<string, unknown> | null) ?? null,
      errorCode: record.error_code,
      errorMessage: record.error_message,
      triggeredByUserId: record.triggered_by_user_id,
      startedAt: record.started_at,
      completedAt: record.completed_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
