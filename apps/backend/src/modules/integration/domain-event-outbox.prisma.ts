import { Injectable } from '@nestjs/common';
import {
  DomainEventOutbox,
  DomainEventOutboxRepository,
} from '@nexus/integration';
import { Prisma } from '@prisma/client';
import { WebhookEventType } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaDomainEventOutboxRepository
  implements DomainEventOutboxRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: DomainEventOutbox): Promise<DomainEventOutbox> {
    const record = await this.prisma.domainEventOutbox.create({
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async update(data: DomainEventOutbox): Promise<DomainEventOutbox> {
    const record = await this.prisma.domainEventOutbox.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async findUnpublished(limit: number): Promise<DomainEventOutbox[]> {
    const records = await this.prisma.domainEventOutbox.findMany({
      where: { published_at: null },
      take: limit,
      orderBy: { created_at: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  private toPersistence(
    data: DomainEventOutbox,
  ): Prisma.DomainEventOutboxUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      aggregate_type: data.aggregateType,
      aggregate_id: data.aggregateId,
      event_type: data.eventType,
      payload: data.payload as Prisma.InputJsonValue,
      published_at: data.publishedAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    aggregate_type: string;
    aggregate_id: string;
    event_type: string;
    payload: Prisma.JsonValue;
    published_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): DomainEventOutbox {
    return new DomainEventOutbox({
      id: record.id,
      organizationId: record.organization_id,
      aggregateType: record.aggregate_type,
      aggregateId: record.aggregate_id,
      eventType: record.event_type as WebhookEventType,
      payload: record.payload as Record<string, unknown>,
      publishedAt: record.published_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }
}
