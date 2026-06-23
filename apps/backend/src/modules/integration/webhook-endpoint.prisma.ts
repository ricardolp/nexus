import { Injectable } from '@nestjs/common';
import {
  WebhookEndpoint,
  WebhookEndpointPageParams,
  WebhookEndpointRepository,
} from '@nexus/integration';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaWebhookEndpointRepository
  implements WebhookEndpointRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: WebhookEndpoint): Promise<WebhookEndpoint> {
    const record = await this.prisma.webhookEndpoint.create({
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async update(data: WebhookEndpoint): Promise<WebhookEndpoint> {
    const record = await this.prisma.webhookEndpoint.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });
    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<WebhookEndpoint | null> {
    const record = await this.prisma.webhookEndpoint.findFirst({
      where: { id, deleted_at: null },
    });
    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: WebhookEndpointPageParams,
  ): Promise<PageResult<WebhookEndpoint>> {
    const where: Prisma.WebhookEndpointWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.webhookEndpoint.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.webhookEndpoint.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findActiveByOrganizationAndEventType(
    organizationId: string,
    eventType: string,
  ): Promise<WebhookEndpoint[]> {
    const records = await this.prisma.webhookEndpoint.findMany({
      where: {
        organization_id: organizationId,
        active: true,
        deleted_at: null,
        event_types: { has: eventType },
      },
    });

    return records.map((record) => this.toDomain(record));
  }

  private toPersistence(
    data: WebhookEndpoint,
  ): Prisma.WebhookEndpointUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      url: data.url,
      description: data.description ?? null,
      secret: data.secret,
      event_types: data.eventTypes,
      active: data.active,
      created_by_user_id: data.createdByUserId,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: {
    id: string;
    organization_id: string;
    url: string;
    description: string | null;
    secret: string;
    event_types: string[];
    active: boolean;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): WebhookEndpoint {
    return new WebhookEndpoint({
      id: record.id,
      organizationId: record.organization_id,
      url: record.url,
      description: record.description,
      secret: record.secret,
      eventTypes: record.event_types,
      active: record.active,
      createdByUserId: record.created_by_user_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
