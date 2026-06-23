import { Injectable } from '@nestjs/common';
import {
  WebhookDelivery,
  WebhookDeliveryPageParams,
  WebhookDeliveryRepository,
  WebhookDeliveryStatus,
} from '@nexus/integration';
import { Prisma, webhook_delivery_status } from '@prisma/client';
import { PageResult, WebhookEventType } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaWebhookDeliveryRepository
  implements WebhookDeliveryRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: WebhookDelivery): Promise<WebhookDelivery> {
    const record = await this.prisma.webhookDelivery.create({
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async update(data: WebhookDelivery): Promise<WebhookDelivery> {
    const record = await this.prisma.webhookDelivery.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async findById(id: string): Promise<WebhookDelivery | null> {
    const record = await this.prisma.webhookDelivery.findUnique({
      where: { id },
    });
    return record ? this.toDomain(record) : null;
  }

  async findByIdempotencyKey(key: string): Promise<WebhookDelivery | null> {
    const record = await this.prisma.webhookDelivery.findUnique({
      where: { idempotency_key: key },
    });
    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: WebhookDeliveryPageParams,
  ): Promise<PageResult<WebhookDelivery>> {
    const where: Prisma.WebhookDeliveryWhereInput = {
      webhook_endpoint_id: params.webhookEndpointId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findDueRetries(
    limit: number,
    referenceDate: Date,
  ): Promise<WebhookDelivery[]> {
    const records = await this.prisma.webhookDelivery.findMany({
      where: {
        status: webhook_delivery_status.pending,
        OR: [{ next_retry_at: null }, { next_retry_at: { lte: referenceDate } }],
      },
      take: limit,
      orderBy: { created_at: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  private toPersistence(
    data: WebhookDelivery,
  ): Prisma.WebhookDeliveryUncheckedCreateInput {
    return {
      id: data.id,
      webhook_endpoint_id: data.webhookEndpointId,
      organization_id: data.organizationId,
      event_type: data.eventType,
      payload: data.payload as Prisma.InputJsonValue,
      status: data.status as webhook_delivery_status,
      attempts: data.attempts,
      next_retry_at: data.nextRetryAt ?? null,
      last_error: data.lastError ?? null,
      delivered_at: data.deliveredAt ?? null,
      idempotency_key: data.idempotencyKey,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };
  }

  private toDomain(record: {
    id: string;
    webhook_endpoint_id: string;
    organization_id: string;
    event_type: string;
    payload: Prisma.JsonValue;
    status: webhook_delivery_status;
    attempts: number;
    next_retry_at: Date | null;
    last_error: string | null;
    delivered_at: Date | null;
    idempotency_key: string;
    created_at: Date;
    updated_at: Date;
  }): WebhookDelivery {
    return new WebhookDelivery({
      id: record.id,
      webhookEndpointId: record.webhook_endpoint_id,
      organizationId: record.organization_id,
      eventType: record.event_type as WebhookEventType,
      payload: record.payload as Record<string, unknown>,
      status: record.status as WebhookDeliveryStatus,
      attempts: record.attempts,
      nextRetryAt: record.next_retry_at,
      lastError: record.last_error,
      deliveredAt: record.delivered_at,
      idempotencyKey: record.idempotency_key,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    });
  }
}
