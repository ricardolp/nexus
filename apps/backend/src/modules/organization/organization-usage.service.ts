import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

export interface OrganizationUsageQuery {
  organizationId: string;
  from?: Date;
  to?: Date;
}

export interface OrganizationUsageResult {
  organizationId: string;
  period: {
    from: string | null;
    to: string | null;
  };
  resources: {
    companies: number;
    members: number;
    certificates: number;
  };
  documents: {
    nfe: {
      total: number;
      emitted: number;
      byDirection: Record<string, number>;
      byStatus: Record<string, number>;
      byModel: Record<string, number>;
    };
    nfse: {
      total: number;
      emitted: number;
      byDirection: Record<string, number>;
      byStatus: Record<string, number>;
    };
    total: number;
  };
  events: {
    nfe: {
      total: number;
      byType: Record<string, number>;
    };
    nfse: {
      total: number;
      byType: Record<string, number>;
    };
    total: number;
  };
  integration: {
    requestLogs: number;
    byOperation: Record<string, number>;
    webhookDeliveries: number;
  };
}

function toCountMap<T extends string>(
  rows: Array<{ [K in T]: string } & { _count: number }>,
  key: T,
): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row[key], row._count]));
}

function buildDateFilter(
  from?: Date,
  to?: Date,
): Prisma.DateTimeFilter | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}

@Injectable()
export class OrganizationUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsage(query: OrganizationUsageQuery): Promise<OrganizationUsageResult> {
    const { organizationId, from, to } = query;
    const createdAt = buildDateFilter(from, to);

    const nfeDocWhere: Prisma.FiscalNfeDocumentWhereInput = {
      deleted_at: null,
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const nfseDocWhere: Prisma.FiscalNfseDocumentWhereInput = {
      deleted_at: null,
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const nfeEventWhere: Prisma.FiscalNfeDocumentEventWhereInput = {
      deleted_at: null,
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const nfseEventWhere: Prisma.FiscalNfseDocumentEventWhereInput = {
      deleted_at: null,
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const integrationWhere: Prisma.IntegrationRequestLogWhereInput = {
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const webhookWhere: Prisma.WebhookDeliveryWhereInput = {
      organization_id: organizationId,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const [
      companies,
      members,
      certificates,
      nfeTotal,
      nfeEmitted,
      nfeByDirection,
      nfeByStatus,
      nfeByModel,
      nfseTotal,
      nfseEmitted,
      nfseByDirection,
      nfseByStatus,
      nfeEventsTotal,
      nfeEventsByType,
      nfseEventsTotal,
      nfseEventsByType,
      integrationTotal,
      integrationByOperation,
      webhookDeliveries,
    ] = await Promise.all([
      this.prisma.organizationCompany.count({
        where: { deleted_at: null, organization_id: organizationId },
      }),
      this.prisma.organizationMember.count({
        where: { deleted_at: null, organization_id: organizationId },
      }),
      this.prisma.organizationCompanyCertificate.count({
        where: { deleted_at: null, organization_id: organizationId },
      }),
      this.prisma.fiscalNfeDocument.count({ where: nfeDocWhere }),
      this.prisma.fiscalNfeDocument.count({
        where: {
          ...nfeDocWhere,
          direction: 'outbound',
          status: 'authorized',
        },
      }),
      this.prisma.fiscalNfeDocument.groupBy({
        by: ['direction'],
        where: nfeDocWhere,
        _count: true,
      }),
      this.prisma.fiscalNfeDocument.groupBy({
        by: ['status'],
        where: nfeDocWhere,
        _count: true,
      }),
      this.prisma.fiscalNfeDocument.groupBy({
        by: ['model'],
        where: nfeDocWhere,
        _count: true,
      }),
      this.prisma.fiscalNfseDocument.count({ where: nfseDocWhere }),
      this.prisma.fiscalNfseDocument.count({
        where: {
          ...nfseDocWhere,
          direction: 'outbound',
          status: 'authorized',
        },
      }),
      this.prisma.fiscalNfseDocument.groupBy({
        by: ['direction'],
        where: nfseDocWhere,
        _count: true,
      }),
      this.prisma.fiscalNfseDocument.groupBy({
        by: ['status'],
        where: nfseDocWhere,
        _count: true,
      }),
      this.prisma.fiscalNfeDocumentEvent.count({ where: nfeEventWhere }),
      this.prisma.fiscalNfeDocumentEvent.groupBy({
        by: ['event_type'],
        where: nfeEventWhere,
        _count: true,
      }),
      this.prisma.fiscalNfseDocumentEvent.count({ where: nfseEventWhere }),
      this.prisma.fiscalNfseDocumentEvent.groupBy({
        by: ['event_type'],
        where: nfseEventWhere,
        _count: true,
      }),
      this.prisma.integrationRequestLog.count({ where: integrationWhere }),
      this.prisma.integrationRequestLog.groupBy({
        by: ['operation'],
        where: integrationWhere,
        _count: true,
      }),
      this.prisma.webhookDelivery.count({ where: webhookWhere }),
    ]);

    return {
      organizationId,
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      resources: {
        companies,
        members,
        certificates,
      },
      documents: {
        nfe: {
          total: nfeTotal,
          emitted: nfeEmitted,
          byDirection: toCountMap(nfeByDirection, 'direction'),
          byStatus: toCountMap(nfeByStatus, 'status'),
          byModel: toCountMap(nfeByModel, 'model'),
        },
        nfse: {
          total: nfseTotal,
          emitted: nfseEmitted,
          byDirection: toCountMap(nfseByDirection, 'direction'),
          byStatus: toCountMap(nfseByStatus, 'status'),
        },
        total: nfeTotal + nfseTotal,
      },
      events: {
        nfe: {
          total: nfeEventsTotal,
          byType: toCountMap(nfeEventsByType, 'event_type'),
        },
        nfse: {
          total: nfseEventsTotal,
          byType: toCountMap(nfseEventsByType, 'event_type'),
        },
        total: nfeEventsTotal + nfseEventsTotal,
      },
      integration: {
        requestLogs: integrationTotal,
        byOperation: toCountMap(integrationByOperation, 'operation'),
        webhookDeliveries,
      },
    };
  }
}
