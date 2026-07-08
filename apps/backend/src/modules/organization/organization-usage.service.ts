import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

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

export interface OrganizationUsageQuery {
  organizationId: string;
  from?: Date;
  to?: Date;
}

export interface OrganizationUsageListQuery {
  from?: Date;
  to?: Date;
}

export interface OrganizationUsageSummaryItem {
  organizationId: string;
  nome: string;
  slug: string;
  companies: number;
  members: number;
  nfeEmitted: number;
  nfseEmitted: number;
  emittedTotal: number;
  documentsTotal: number;
  eventsTotal: number;
  integrationRequests: number;
  webhookDeliveries: number;
}

export interface OrganizationUsageListResult {
  period: {
    from: string | null;
    to: string | null;
  };
  totals: {
    organizations: number;
    companies: number;
    members: number;
    nfeEmitted: number;
    nfseEmitted: number;
    emittedTotal: number;
    documentsTotal: number;
    eventsTotal: number;
    integrationRequests: number;
    webhookDeliveries: number;
  };
  items: OrganizationUsageSummaryItem[];
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

function countByOrg(
  rows: Array<{ organization_id: string; _count: number }>,
): Map<string, number> {
  return new Map(rows.map((row) => [row.organization_id, row._count]));
}

function getCount(map: Map<string, number>, organizationId: string): number {
  return map.get(organizationId) ?? 0;
}

@Injectable()
export class OrganizationUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsageSummary(
    query: OrganizationUsageListQuery = {},
  ): Promise<OrganizationUsageListResult> {
    const { from, to } = query;
    const createdAt = buildDateFilter(from, to);

    const organizations = await this.prisma.organization.findMany({
      where: { deleted_at: null },
      select: { id: true, nome: true, slug: true },
      orderBy: { nome: 'asc' },
    });

    const docBase = {
      deleted_at: null,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const eventBase = {
      deleted_at: null,
      ...(createdAt ? { created_at: createdAt } : {}),
    };

    const integrationBase = createdAt ? { created_at: createdAt } : {};
    const webhookBase = createdAt ? { created_at: createdAt } : {};

    const [
      companiesByOrg,
      membersByOrg,
      nfeEmittedByOrg,
      nfseEmittedByOrg,
      nfeTotalByOrg,
      nfseTotalByOrg,
      nfeEventsByOrg,
      nfseEventsByOrg,
      integrationByOrg,
      webhookByOrg,
    ] = await Promise.all([
      this.prisma.organizationCompany.groupBy({
        by: ['organization_id'],
        where: { deleted_at: null },
        _count: true,
      }),
      this.prisma.organizationMember.groupBy({
        by: ['organization_id'],
        where: { deleted_at: null },
        _count: true,
      }),
      this.prisma.fiscalNfeDocument.groupBy({
        by: ['organization_id'],
        where: {
          ...docBase,
          direction: 'outbound',
          status: 'authorized',
        },
        _count: true,
      }),
      this.prisma.fiscalNfseDocument.groupBy({
        by: ['organization_id'],
        where: {
          ...docBase,
          direction: 'outbound',
          status: 'authorized',
        },
        _count: true,
      }),
      this.prisma.fiscalNfeDocument.groupBy({
        by: ['organization_id'],
        where: docBase,
        _count: true,
      }),
      this.prisma.fiscalNfseDocument.groupBy({
        by: ['organization_id'],
        where: docBase,
        _count: true,
      }),
      this.prisma.fiscalNfeDocumentEvent.groupBy({
        by: ['organization_id'],
        where: eventBase,
        _count: true,
      }),
      this.prisma.fiscalNfseDocumentEvent.groupBy({
        by: ['organization_id'],
        where: eventBase,
        _count: true,
      }),
      this.prisma.integrationRequestLog.groupBy({
        by: ['organization_id'],
        where: integrationBase,
        _count: true,
      }),
      this.prisma.webhookDelivery.groupBy({
        by: ['organization_id'],
        where: webhookBase,
        _count: true,
      }),
    ]);

    const companiesMap = countByOrg(companiesByOrg);
    const membersMap = countByOrg(membersByOrg);
    const nfeEmittedMap = countByOrg(nfeEmittedByOrg);
    const nfseEmittedMap = countByOrg(nfseEmittedByOrg);
    const nfeTotalMap = countByOrg(nfeTotalByOrg);
    const nfseTotalMap = countByOrg(nfseTotalByOrg);
    const nfeEventsMap = countByOrg(nfeEventsByOrg);
    const nfseEventsMap = countByOrg(nfseEventsByOrg);
    const integrationMap = countByOrg(integrationByOrg);
    const webhookMap = countByOrg(webhookByOrg);

    const items = organizations.map((organization) => {
      const nfeEmitted = getCount(nfeEmittedMap, organization.id);
      const nfseEmitted = getCount(nfseEmittedMap, organization.id);
      const documentsTotal =
        getCount(nfeTotalMap, organization.id) + getCount(nfseTotalMap, organization.id);
      const eventsTotal =
        getCount(nfeEventsMap, organization.id) + getCount(nfseEventsMap, organization.id);

      return {
        organizationId: organization.id,
        nome: organization.nome,
        slug: organization.slug,
        companies: getCount(companiesMap, organization.id),
        members: getCount(membersMap, organization.id),
        nfeEmitted,
        nfseEmitted,
        emittedTotal: nfeEmitted + nfseEmitted,
        documentsTotal,
        eventsTotal,
        integrationRequests: getCount(integrationMap, organization.id),
        webhookDeliveries: getCount(webhookMap, organization.id),
      };
    });

    const totals = items.reduce(
      (acc, item) => ({
        organizations: acc.organizations + 1,
        companies: acc.companies + item.companies,
        members: acc.members + item.members,
        nfeEmitted: acc.nfeEmitted + item.nfeEmitted,
        nfseEmitted: acc.nfseEmitted + item.nfseEmitted,
        emittedTotal: acc.emittedTotal + item.emittedTotal,
        documentsTotal: acc.documentsTotal + item.documentsTotal,
        eventsTotal: acc.eventsTotal + item.eventsTotal,
        integrationRequests: acc.integrationRequests + item.integrationRequests,
        webhookDeliveries: acc.webhookDeliveries + item.webhookDeliveries,
      }),
      {
        organizations: 0,
        companies: 0,
        members: 0,
        nfeEmitted: 0,
        nfseEmitted: 0,
        emittedTotal: 0,
        documentsTotal: 0,
        eventsTotal: 0,
        integrationRequests: 0,
        webhookDeliveries: 0,
      },
    );

    return {
      period: {
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
      totals,
      items,
    };
  }

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
