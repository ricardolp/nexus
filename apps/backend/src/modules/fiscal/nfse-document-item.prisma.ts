import { Injectable } from '@nestjs/common';
import {
  FiscalNfsePedidoValidationStatus,
  NfseDocumentItem,
  NfseDocumentItemPageParams,
  NfseDocumentItemRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseDocumentItemRecord = {
  id: string;
  document_id: string;
  line_number: number;
  prod_codigo: string;
  descricao: string;
  service_code: string;
  municipality_code: string;
  qty: Prisma.Decimal;
  uom: string;
  valor_total: Prisma.Decimal;
  x_ped: string | null;
  n_item_ped: string | null;
  pedido_validation_status: FiscalNfsePedidoValidationStatus;
  pedido_validation_message: string | null;
  sap_order_number: string | null;
  sap_order_item: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseDocumentItemRepository
  implements NfseDocumentItemRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseDocumentItem): Promise<NfseDocumentItem> {
    const record = await this.prisma.fiscalNfseDocumentItem.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseDocumentItem): Promise<NfseDocumentItem> {
    const record = await this.prisma.fiscalNfseDocumentItem.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseDocumentItem.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseDocumentItem | null> {
    const record = await this.prisma.fiscalNfseDocumentItem.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(documentId: string): Promise<NfseDocumentItem[]> {
    const records = await this.prisma.fiscalNfseDocumentItem.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfseDocumentItemPageParams,
  ): Promise<PageResult<NfseDocumentItem>> {
    const where: Prisma.FiscalNfseDocumentItemWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseDocumentItem.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { line_number: 'asc' },
      }),
      this.prisma.fiscalNfseDocumentItem.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseDocumentItem,
  ): Prisma.FiscalNfseDocumentItemUncheckedCreateInput {
    return {
      id: data.id,
      document_id: data.documentId,
      line_number: data.lineNumber,
      prod_codigo: data.prodCodigo,
      descricao: data.descricao,
      service_code: data.serviceCode,
      municipality_code: data.municipalityCode,
      qty: data.qty,
      uom: data.uom,
      valor_total: data.valorTotal,
      x_ped: data.xPed ?? null,
      n_item_ped: data.nItemPed ?? null,
      pedido_validation_status: data.pedidoValidationStatus,
      pedido_validation_message: data.pedidoValidationMessage ?? null,
      sap_order_number: data.sapOrderNumber ?? null,
      sap_order_item: data.sapOrderItem ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfseDocumentItemRecord): NfseDocumentItem {
    return new NfseDocumentItem({
      id: record.id,
      documentId: record.document_id,
      lineNumber: record.line_number,
      prodCodigo: record.prod_codigo,
      descricao: record.descricao,
      serviceCode: record.service_code,
      municipalityCode: record.municipality_code,
      qty: record.qty.toString(),
      uom: record.uom,
      valorTotal: record.valor_total.toString(),
      xPed: record.x_ped,
      nItemPed: record.n_item_ped,
      pedidoValidationStatus: record.pedido_validation_status,
      pedidoValidationMessage: record.pedido_validation_message,
      sapOrderNumber: record.sap_order_number,
      sapOrderItem: record.sap_order_item,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
