import { Injectable } from '@nestjs/common';
import {
  FiscalNfeEventStatus,
  FiscalNfeEventType,
  NfeDocumentEvent,
  NfeDocumentEventPageParams,
  NfeDocumentEventRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeDocumentEventRecord = {
  id: string;
  organization_id: string;
  document_id: string;
  event_type: FiscalNfeEventType;
  event_status: FiscalNfeEventStatus;
  sequence: number;
  sefaz_status_code: string | null;
  sefaz_status_message: string | null;
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
export class PrismaNfeDocumentEventRepository
  implements NfeDocumentEventRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeDocumentEvent): Promise<NfeDocumentEvent> {
    const record = await this.prisma.fiscalNfeDocumentEvent.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeDocumentEvent): Promise<NfeDocumentEvent> {
    const record = await this.prisma.fiscalNfeDocumentEvent.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeDocumentEvent.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeDocumentEvent | null> {
    const record = await this.prisma.fiscalNfeDocumentEvent.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: NfeDocumentEventPageParams,
  ): Promise<PageResult<NfeDocumentEvent>> {
    const where: Prisma.FiscalNfeDocumentEventWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      document_id: params.documentId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocumentEvent.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeDocumentEvent.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeDocumentEvent,
  ): Prisma.FiscalNfeDocumentEventUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      document_id: data.documentId,
      event_type: data.eventType,
      event_status: data.eventStatus,
      sequence: data.sequence,
      sefaz_status_code: data.sefazStatusCode ?? null,
      sefaz_status_message: data.sefazStatusMessage ?? null,
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

  private toDomain(record: FiscalNfeDocumentEventRecord): NfeDocumentEvent {
    return new NfeDocumentEvent({
      id: record.id,
      organizationId: record.organization_id,
      documentId: record.document_id,
      eventType: record.event_type,
      eventStatus: record.event_status,
      sequence: record.sequence,
      sefazStatusCode: record.sefaz_status_code,
      sefazStatusMessage: record.sefaz_status_message,
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
