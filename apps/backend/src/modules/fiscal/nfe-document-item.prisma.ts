import { Injectable } from '@nestjs/common';
import {
  FiscalNfePedidoValidationStatus,
  NfeDocumentItem,
  NfeDocumentItemPageParams,
  NfeDocumentItemRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeDocumentItemRecord = {
  id: string;
  document_id: string;
  line_number: number;
  prod_codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  qty: Prisma.Decimal;
  uom: string;
  valor_total: Prisma.Decimal;
  x_ped: string | null;
  n_item_ped: string | null;
  pedido_validation_status: FiscalNfePedidoValidationStatus;
  pedido_validation_message: string | null;
  sap_order_number: string | null;
  sap_order_item: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfeDocumentItemRepository
  implements NfeDocumentItemRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeDocumentItem): Promise<NfeDocumentItem> {
    const record = await this.prisma.fiscalNfeDocumentItem.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeDocumentItem): Promise<NfeDocumentItem> {
    const record = await this.prisma.fiscalNfeDocumentItem.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeDocumentItem.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeDocumentItem | null> {
    const record = await this.prisma.fiscalNfeDocumentItem.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByDocumentId(documentId: string): Promise<NfeDocumentItem[]> {
    const records = await this.prisma.fiscalNfeDocumentItem.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfeDocumentItemPageParams,
  ): Promise<PageResult<NfeDocumentItem>> {
    const where: Prisma.FiscalNfeDocumentItemWhereInput = {
      deleted_at: null,
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeDocumentItem.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { line_number: 'asc' },
      }),
      this.prisma.fiscalNfeDocumentItem.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeDocumentItem,
  ): Prisma.FiscalNfeDocumentItemUncheckedCreateInput {
    return {
      id: data.id,
      document_id: data.documentId,
      line_number: data.lineNumber,
      prod_codigo: data.prodCodigo,
      descricao: data.descricao,
      ncm: data.ncm,
      cfop: data.cfop,
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

  private toDomain(record: FiscalNfeDocumentItemRecord): NfeDocumentItem {
    return new NfeDocumentItem({
      id: record.id,
      documentId: record.document_id,
      lineNumber: record.line_number,
      prodCodigo: record.prod_codigo,
      descricao: record.descricao,
      ncm: record.ncm,
      cfop: record.cfop,
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
