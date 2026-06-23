import { Injectable } from '@nestjs/common';
import {
  FiscalNfeInboundStatus,
  NfeInboundProcess,
  NfeInboundProcessPageParams,
  NfeInboundProcessRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeInboundProcessRecord = {
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
};

@Injectable()
export class PrismaNfeInboundProcessRepository
  implements NfeInboundProcessRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeInboundProcess): Promise<NfeInboundProcess> {
    const record = await this.prisma.fiscalNfeInboundProcess.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeInboundProcess): Promise<NfeInboundProcess> {
    const record = await this.prisma.fiscalNfeInboundProcess.update({
      where: { document_id: data.documentId },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeInboundProcess.update({
      where: { document_id: id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeInboundProcess | null> {
    const record = await this.prisma.fiscalNfeInboundProcess.findFirst({
      where: { document_id: id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(
    documentId: string,
  ): Promise<NfeInboundProcess | null> {
    return this.findById(documentId);
  }

  async findPage(
    params: NfeInboundProcessPageParams,
  ): Promise<PageResult<NfeInboundProcess>> {
    const where: Prisma.FiscalNfeInboundProcessWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeInboundProcess.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeInboundProcess.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeInboundProcess,
  ): Prisma.FiscalNfeInboundProcessUncheckedCreateInput {
    return {
      document_id: data.documentId,
      inbound_status: data.inboundStatus,
      status_changed_at: data.statusChangedAt,
      sefaz_validated_at: data.sefazValidatedAt ?? null,
      pedido_validated_at: data.pedidoValidatedAt ?? null,
      delivery_created_at: data.deliveryCreatedAt ?? null,
      portaria_confirmed_at: data.portariaConfirmedAt ?? null,
      portaria_confirmed_by_user_id: data.portariaConfirmedByUserId ?? null,
      migo_completed_at: data.migoCompletedAt ?? null,
      miro_completed_at: data.miroCompletedAt ?? null,
      rejected_at: data.rejectedAt ?? null,
      rejected_by_user_id: data.rejectedByUserId ?? null,
      rejection_reason: data.rejectionReason ?? null,
      alert_code: data.alertCode ?? null,
      alert_message: data.alertMessage ?? null,
      correlation_id: data.correlationId ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfeInboundProcessRecord): NfeInboundProcess {
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
}
