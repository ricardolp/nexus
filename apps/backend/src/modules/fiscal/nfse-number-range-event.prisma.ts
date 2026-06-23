import { Injectable } from '@nestjs/common';
import {
  FiscalNfseEventStatus,
  FiscalNfseNumberRangeEventType,
  NfseNumberRangeEvent,
  NfseNumberRangeEventPageParams,
  NfseNumberRangeEventRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseNumberRangeEventRecord = {
  id: string;
  number_range_id: string;
  event_type: FiscalNfseNumberRangeEventType;
  event_status: FiscalNfseEventStatus;
  prefeitura_status_code: string | null;
  prefeitura_status_message: string | null;
  protocol: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseNumberRangeEventRepository
  implements NfseNumberRangeEventRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseNumberRangeEvent): Promise<NfseNumberRangeEvent> {
    const record = await this.prisma.fiscalNfseNumberRangeEvent.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseNumberRangeEvent): Promise<NfseNumberRangeEvent> {
    const record = await this.prisma.fiscalNfseNumberRangeEvent.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseNumberRangeEvent.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseNumberRangeEvent | null> {
    const record = await this.prisma.fiscalNfseNumberRangeEvent.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: NfseNumberRangeEventPageParams,
  ): Promise<PageResult<NfseNumberRangeEvent>> {
    const where: Prisma.FiscalNfseNumberRangeEventWhereInput = {
      deleted_at: null,
      ...(params.numberRangeId
        ? { number_range_id: params.numberRangeId }
        : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseNumberRangeEvent.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseNumberRangeEvent.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseNumberRangeEvent,
  ): Prisma.FiscalNfseNumberRangeEventUncheckedCreateInput {
    return {
      id: data.id,
      number_range_id: data.numberRangeId,
      event_type: data.eventType,
      event_status: data.eventStatus,
      prefeitura_status_code: data.prefeituraStatusCode ?? null,
      prefeitura_status_message: data.prefeituraStatusMessage ?? null,
      protocol: data.protocol ?? null,
      error_code: data.errorCode ?? null,
      error_message: data.errorMessage ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(
    record: FiscalNfseNumberRangeEventRecord,
  ): NfseNumberRangeEvent {
    return new NfseNumberRangeEvent({
      id: record.id,
      numberRangeId: record.number_range_id,
      eventType: record.event_type,
      eventStatus: record.event_status,
      prefeituraStatusCode: record.prefeitura_status_code,
      prefeituraStatusMessage: record.prefeitura_status_message,
      protocol: record.protocol,
      errorCode: record.error_code,
      errorMessage: record.error_message,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
