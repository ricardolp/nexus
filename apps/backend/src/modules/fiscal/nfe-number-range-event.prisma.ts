import { Injectable } from '@nestjs/common';
import {
  FiscalNfeEventStatus,
  FiscalNfeNumberRangeEventType,
  NfeNumberRangeEvent,
  NfeNumberRangeEventPageParams,
  NfeNumberRangeEventRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeNumberRangeEventRecord = {
  id: string;
  number_range_id: string;
  event_type: FiscalNfeNumberRangeEventType;
  event_status: FiscalNfeEventStatus;
  sefaz_status_code: string | null;
  sefaz_status_message: string | null;
  protocol: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeNumberRangeEventRepository
  implements NfeNumberRangeEventRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeNumberRangeEvent): Promise<NfeNumberRangeEvent> {
    const record = await this.prisma.fiscalNfeNumberRangeEvent.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeNumberRangeEvent): Promise<NfeNumberRangeEvent> {
    const record = await this.prisma.fiscalNfeNumberRangeEvent.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeNumberRangeEvent.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeNumberRangeEvent | null> {
    const record = await this.prisma.fiscalNfeNumberRangeEvent.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: NfeNumberRangeEventPageParams,
  ): Promise<PageResult<NfeNumberRangeEvent>> {
    const where: Prisma.FiscalNfeNumberRangeEventWhereInput = {
      deleted_at: null,
      ...(params.numberRangeId
        ? { number_range_id: params.numberRangeId }
        : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeNumberRangeEvent.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeNumberRangeEvent.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeNumberRangeEvent,
  ): Prisma.FiscalNfeNumberRangeEventUncheckedCreateInput {
    return {
      id: data.id,
      number_range_id: data.numberRangeId,
      event_type: data.eventType,
      event_status: data.eventStatus,
      sefaz_status_code: data.sefazStatusCode ?? null,
      sefaz_status_message: data.sefazStatusMessage ?? null,
      protocol: data.protocol ?? null,
      error_code: data.errorCode ?? null,
      error_message: data.errorMessage ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(
    record: FiscalNfeNumberRangeEventRecord,
  ): NfeNumberRangeEvent {
    return new NfeNumberRangeEvent({
      id: record.id,
      numberRangeId: record.number_range_id,
      eventType: record.event_type,
      eventStatus: record.event_status,
      sefazStatusCode: record.sefaz_status_code,
      sefazStatusMessage: record.sefaz_status_message,
      protocol: record.protocol,
      errorCode: record.error_code,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
