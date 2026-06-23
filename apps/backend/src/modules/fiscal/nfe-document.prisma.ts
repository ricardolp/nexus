import { Injectable } from '@nestjs/common';
import {
  FiscalDocumentDirection,
  FiscalNfeDocumentStatus,
  FiscalNfeEnvironment,
  FiscalNfeInboundStatus,
  NfeDocument,
  NfeDocumentPageParams,
  NfeDocumentRepository,
  NfeInboundProcess,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

export type NfeDocumentWithInbound = {
  document: NfeDocument;
  inboundProcess: NfeInboundProcess | null;
};

export type NfeDocumentsSummary = {
  total: { count: number; amount: string };
  inbound: { count: number; amount: string };
  outbound: { count: number; amount: string };
  faturadas: { count: number; amount: string };
  pendentes: { count: number; amount: string };
  alertasErros: { count: number; amount: string };
};

type FiscalNfeDocumentRecord = {
  id: string;
  organization_id: string;
  company_id: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfeEnvironment;
  status: FiscalNfeDocumentStatus;
  model: string;
  series: number;
  number: number;
  access_key: string | null;
  issuer_cnpj: string;
  issuer_name: string | null;
  recipient_document: string | null;
  recipient_name: string | null;
  total_amount: Prisma.Decimal | null;
  issued_at: Date | null;
  authorized_at: Date | null;
  cancelled_at: Date | null;
  authorization_protocol: string | null;
  cancellation_protocol: string | null;
  sefaz_status_code: string | null;
  sefaz_status_message: string | null;
  sap_document_id: string | null;
  sap_order_id: string | null;
  idempotency_key: string | null;
  metadata: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeDocumentRepository implements NfeDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeDocument): Promise<NfeDocument> {
    const record = await this.prisma.fiscalNfeDocument.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeDocument): Promise<NfeDocument> {
    const record = await this.prisma.fiscalNfeDocument.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeDocument.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeDocument | null> {
    const record = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByAccessKey(accessKey: string): Promise<NfeDocument | null> {
    const record = await this.prisma.fiscalNfeDocument.findFirst({
      where: { access_key: accessKey, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<NfeDocument | null> {
    const record = await this.prisma.fiscalNfeDocument.findFirst({
      where: {
        company_id: companyId,
        idempotency_key: idempotencyKey,
        deleted_at: null,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  private buildPageWhere(
    params: Pick<
      NfeDocumentPageParams,
      'organizationId' | 'companyId' | 'direction' | 'search' | 'inboundStatus'
    >,
  ): Prisma.FiscalNfeDocumentWhereInput {
    const search = params.search?.trim();
    const parsedNumber = search ? Number(search) : NaN;

    return {
      deleted_at: null,
      organization_id: params.organizationId,
      ...(params.companyId ? { company_id: params.companyId } : {}),
      ...(params.direction ? { direction: params.direction } : {}),
      ...(params.inboundStatus
        ? {
            inboundProcess: {
              inbound_status: params.inboundStatus as FiscalNfeInboundStatus,
              deleted_at: null,
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { access_key: { contains: search, mode: 'insensitive' } },
              { issuer_cnpj: { contains: search.replace(/\D/g, '') } },
              {
                recipient_document: {
                  contains: search.replace(/\D/g, ''),
                },
              },
              { recipient_name: { contains: search, mode: 'insensitive' } },
              ...(Number.isFinite(parsedNumber)
                ? [{ number: parsedNumber }]
                : []),
            ],
          }
        : {}),
    };
  }

  async findPage(
    params: NfeDocumentPageParams,
  ): Promise<PageResult<NfeDocument>> {
    const where = this.buildPageWhere(params);
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocument.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeDocument.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findPageWithInbound(
    params: NfeDocumentPageParams,
  ): Promise<PageResult<NfeDocumentWithInbound>> {
    const where = this.buildPageWhere(params);
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocument.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
        include: {
          inboundProcess: {
            where: { deleted_at: null },
          },
        },
      }),
      this.prisma.fiscalNfeDocument.count({ where }),
    ]);

    return {
      items: records.map((record) => ({
        document: this.toDomain(record),
        inboundProcess: record.inboundProcess
          ? this.toInboundDomain(record.inboundProcess)
          : null,
      })),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async getSummary(
    organizationId: string,
    companyId?: string,
  ): Promise<NfeDocumentsSummary> {
    const baseWhere: Prisma.FiscalNfeDocumentWhereInput = {
      deleted_at: null,
      organization_id: organizationId,
      ...(companyId ? { company_id: companyId } : {}),
    };

    const sumAmount = (value: Prisma.Decimal | null | undefined) =>
      value?.toString() ?? '0';

    const [totalAgg, inboundAgg, outboundAgg, faturadasAgg, pendentesAgg, alertasAgg] =
      await Promise.all([
        this.prisma.fiscalNfeDocument.aggregate({
          where: baseWhere,
          _count: true,
          _sum: { total_amount: true },
        }),
        this.prisma.fiscalNfeDocument.aggregate({
          where: { ...baseWhere, direction: 'inbound' },
          _count: true,
          _sum: { total_amount: true },
        }),
        this.prisma.fiscalNfeDocument.aggregate({
          where: { ...baseWhere, direction: 'outbound' },
          _count: true,
          _sum: { total_amount: true },
        }),
        this.prisma.fiscalNfeDocument.aggregate({
          where: {
            ...baseWhere,
            direction: 'inbound',
            inboundProcess: {
              deleted_at: null,
              inbound_status: 'miro_done',
            },
          },
          _count: true,
          _sum: { total_amount: true },
        }),
        this.prisma.fiscalNfeDocument.aggregate({
          where: {
            ...baseWhere,
            direction: 'inbound',
            inboundProcess: {
              deleted_at: null,
              inbound_status: {
                notIn: ['miro_done', 'rejected_inbound'],
              },
            },
          },
          _count: true,
          _sum: { total_amount: true },
        }),
        this.prisma.fiscalNfeDocument.aggregate({
          where: {
            ...baseWhere,
            direction: 'inbound',
            inboundProcess: {
              deleted_at: null,
              inbound_status: {
                in: ['pedido_alert', 'inbound_error', 'rejected_inbound'],
              },
            },
          },
          _count: true,
          _sum: { total_amount: true },
        }),
      ]);

    return {
      total: {
        count: totalAgg._count,
        amount: sumAmount(totalAgg._sum.total_amount),
      },
      inbound: {
        count: inboundAgg._count,
        amount: sumAmount(inboundAgg._sum.total_amount),
      },
      outbound: {
        count: outboundAgg._count,
        amount: sumAmount(outboundAgg._sum.total_amount),
      },
      faturadas: {
        count: faturadasAgg._count,
        amount: sumAmount(faturadasAgg._sum.total_amount),
      },
      pendentes: {
        count: pendentesAgg._count,
        amount: sumAmount(pendentesAgg._sum.total_amount),
      },
      alertasErros: {
        count: alertasAgg._count,
        amount: sumAmount(alertasAgg._sum.total_amount),
      },
    };
  }

  private toInboundDomain(record: {
    document_id: string;
    inbound_status: FiscalNfeInboundStatus;
    status_changed_at: Date;
    sefaz_validated_at: Date | null;
    pedido_validated_at: Date | null;
    delivery_created_at: Date | null;
    portaria_confirmed_at: Date | null;
    portaria_confirmed_by_user_id: string | null;
    migo_completed_at: Date | null;
    miro_completed_at: Date | null;
    rejected_at: Date | null;
    rejected_by_user_id: string | null;
    rejection_reason: string | null;
    alert_code: string | null;
    alert_message: string | null;
    correlation_id: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): NfeInboundProcess {
    return new NfeInboundProcess({
      id: record.document_id,
      documentId: record.document_id,
      inboundStatus: record.inbound_status,
      statusChangedAt: record.status_changed_at,
      sefazValidatedAt: record.sefaz_validated_at,
      pedidoValidatedAt: record.pedido_validated_at,
      deliveryCreatedAt: record.delivery_created_at,
      portariaConfirmedAt: record.portaria_confirmed_at,
      portariaConfirmedByUserId: record.portaria_confirmed_by_user_id,
      migoCompletedAt: record.migo_completed_at,
      miroCompletedAt: record.miro_completed_at,
      rejectedAt: record.rejected_at,
      rejectedByUserId: record.rejected_by_user_id,
      rejectionReason: record.rejection_reason,
      alertCode: record.alert_code,
      alertMessage: record.alert_message,
      correlationId: record.correlation_id,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }

  private toPersistence(
    data: NfeDocument,
  ): Prisma.FiscalNfeDocumentUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      company_id: data.companyId,
      direction: data.direction,
      environment: data.environment,
      status: data.status,
      model: data.model,
      series: data.series,
      number: data.number,
      access_key: data.accessKey ?? null,
      issuer_cnpj: data.issuerCnpj,
      issuer_name: data.issuerName ?? null,
      recipient_document: data.recipientDocument ?? null,
      recipient_name: data.recipientName ?? null,
      total_amount: data.totalAmount ?? null,
      issued_at: data.issuedAt ?? null,
      authorized_at: data.authorizedAt ?? null,
      cancelled_at: data.cancelledAt ?? null,
      authorization_protocol: data.authorizationProtocol ?? null,
      cancellation_protocol: data.cancellationProtocol ?? null,
      sefaz_status_code: data.sefazStatusCode ?? null,
      sefaz_status_message: data.sefazStatusMessage ?? null,
      sap_document_id: data.sapDocumentId ?? null,
      sap_order_id: data.sapOrderId ?? null,
      idempotency_key: data.idempotencyKey ?? null,
      metadata: (data.metadata ?? null) as Prisma.InputJsonValue,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfeDocumentRecord): NfeDocument {
    return new NfeDocument({
      id: record.id,
      organizationId: record.organization_id,
      companyId: record.company_id,
      direction: record.direction,
      environment: record.environment,
      status: record.status,
      model: record.model,
      series: record.series,
      number: record.number,
      accessKey: record.access_key,
      issuerCnpj: record.issuer_cnpj,
      issuerName: record.issuer_name,
      recipientDocument: record.recipient_document,
      recipientName: record.recipient_name,
      totalAmount: record.total_amount?.toString() ?? null,
      issuedAt: record.issued_at,
      authorizedAt: record.authorized_at,
      cancelledAt: record.cancelled_at,
      authorizationProtocol: record.authorization_protocol,
      cancellationProtocol: record.cancellation_protocol,
      sefazStatusCode: record.sefaz_status_code,
      sefazStatusMessage: record.sefaz_status_message,
      sapDocumentId: record.sap_document_id,
      sapOrderId: record.sap_order_id,
      idempotencyKey: record.idempotency_key,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
