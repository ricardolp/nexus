import { Injectable } from '@nestjs/common';
import {
  FiscalNfseInboundStatus,
  NfseInboundProcess,
  NfseInboundProcessPageParams,
  NfseInboundProcessRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseInboundProcessRecord = {
  document_id: string;
  inbound_status: FiscalNfseInboundStatus;
  status_changed_at: Date;
  prefeitura_validated_at: Date | null;
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
export class PrismaNfseInboundProcessRepository
  implements NfseInboundProcessRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseInboundProcess): Promise<NfseInboundProcess> {
    const record = await this.prisma.fiscalNfseInboundProcess.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseInboundProcess): Promise<NfseInboundProcess> {
    const record = await this.prisma.fiscalNfseInboundProcess.update({
      where: { document_id: data.documentId },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseInboundProcess.update({
      where: { document_id: id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseInboundProcess | null> {
    const record = await this.prisma.fiscalNfseInboundProcess.findFirst({
      where: { document_id: id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(
    documentId: string,
  ): Promise<NfseInboundProcess | null> {
    return this.findById(documentId);
  }

  async findPage(
    params: NfseInboundProcessPageParams,
  ): Promise<PageResult<NfseInboundProcess>> {
    const where: Prisma.FiscalNfseInboundProcessWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseInboundProcess.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseInboundProcess.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseInboundProcess,
  ): Prisma.FiscalNfseInboundProcessUncheckedCreateInput {
    return {
      document_id: data.documentId,
      inbound_status: data.inboundStatus,
      status_changed_at: data.statusChangedAt,
      prefeitura_validated_at: data.prefeituraValidatedAt ?? null,
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

  private toDomain(
    record: FiscalNfseInboundProcessRecord,
  ): NfseInboundProcess {
    return new NfseInboundProcess({
      id: record.document_id,
      documentId: record.document_id,
      inboundStatus: record.inbound_status,
      statusChangedAt: record.status_changed_at,
      prefeituraValidatedAt: record.prefeitura_validated_at,
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
