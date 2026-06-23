import { Injectable } from '@nestjs/common';
import {
  FiscalDocumentDirection,
  FiscalNfseDocumentStatus,
  FiscalNfseEnvironment,
  NfseDocument,
  NfseDocumentPageParams,
  NfseDocumentRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseDocumentRecord = {
  id: string;
  organization_id: string;
  company_id: string;
  direction: FiscalDocumentDirection;
  environment: FiscalNfseEnvironment;
  status: FiscalNfseDocumentStatus;
  model: string;
  series: number;
  number: number;
  access_key: string | null;
  issuer_cnpj: string;
  recipient_document: string | null;
  recipient_name: string | null;
  total_amount: Prisma.Decimal | null;
  issued_at: Date | null;
  authorized_at: Date | null;
  cancelled_at: Date | null;
  authorization_protocol: string | null;
  cancellation_protocol: string | null;
  prefeitura_status_code: string | null;
  prefeitura_status_message: string | null;
  sap_document_id: string | null;
  sap_order_id: string | null;
  idempotency_key: string | null;
  metadata: Prisma.JsonValue | null;
  rps_number: number | null;
  rps_series: string | null;
  verification_code: string | null;
  service_code: string | null;
  municipality_code: string | null;
  iss_retained: boolean | null;
  service_description: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseDocumentRepository implements NfseDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseDocument): Promise<NfseDocument> {
    const record = await this.prisma.fiscalNfseDocument.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseDocument): Promise<NfseDocument> {
    const record = await this.prisma.fiscalNfseDocument.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseDocument.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseDocument | null> {
    const record = await this.prisma.fiscalNfseDocument.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByAccessKey(accessKey: string): Promise<NfseDocument | null> {
    const record = await this.prisma.fiscalNfseDocument.findFirst({
      where: { access_key: accessKey, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByIdempotencyKey(
    companyId: string,
    idempotencyKey: string,
  ): Promise<NfseDocument | null> {
    const record = await this.prisma.fiscalNfseDocument.findFirst({
      where: {
        company_id: companyId,
        idempotency_key: idempotencyKey,
        deleted_at: null,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  async findPage(
    params: NfseDocumentPageParams,
  ): Promise<PageResult<NfseDocument>> {
    const where: Prisma.FiscalNfseDocumentWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      ...(params.companyId ? { company_id: params.companyId } : {}),
      ...(params.direction ? { direction: params.direction } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseDocument.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseDocument.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseDocument,
  ): Prisma.FiscalNfseDocumentUncheckedCreateInput {
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
      recipient_document: data.recipientDocument ?? null,
      recipient_name: data.recipientName ?? null,
      total_amount: data.totalAmount ?? null,
      issued_at: data.issuedAt ?? null,
      authorized_at: data.authorizedAt ?? null,
      cancelled_at: data.cancelledAt ?? null,
      authorization_protocol: data.authorizationProtocol ?? null,
      cancellation_protocol: data.cancellationProtocol ?? null,
      prefeitura_status_code: data.prefeituraStatusCode ?? null,
      prefeitura_status_message: data.prefeituraStatusMessage ?? null,
      sap_document_id: data.sapDocumentId ?? null,
      sap_order_id: data.sapOrderId ?? null,
      idempotency_key: data.idempotencyKey ?? null,
      metadata: (data.metadata ?? null) as Prisma.InputJsonValue,
      rps_number: data.rpsNumber ?? null,
      rps_series: data.rpsSeries ?? null,
      verification_code: data.verificationCode ?? null,
      service_code: data.serviceCode ?? null,
      municipality_code: data.municipalityCode ?? null,
      iss_retained: data.issRetained ?? null,
      service_description: data.serviceDescription ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfseDocumentRecord): NfseDocument {
    return new NfseDocument({
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
      recipientDocument: record.recipient_document,
      recipientName: record.recipient_name,
      totalAmount: record.total_amount?.toString() ?? null,
      issuedAt: record.issued_at,
      authorizedAt: record.authorized_at,
      cancelledAt: record.cancelled_at,
      authorizationProtocol: record.authorization_protocol,
      cancellationProtocol: record.cancellation_protocol,
      prefeituraStatusCode: record.prefeitura_status_code,
      prefeituraStatusMessage: record.prefeitura_status_message,
      sapDocumentId: record.sap_document_id,
      sapOrderId: record.sap_order_id,
      idempotencyKey: record.idempotency_key,
      metadata: (record.metadata as Record<string, unknown> | null) ?? null,
      rpsNumber: record.rps_number,
      rpsSeries: record.rps_series,
      verificationCode: record.verification_code,
      serviceCode: record.service_code,
      municipalityCode: record.municipality_code,
      issRetained: record.iss_retained,
      serviceDescription: record.service_description,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
