import { Injectable } from '@nestjs/common';
import {
  FiscalNfseEnvironment,
  NfseNumberRange,
  NfseNumberRangePageParams,
  NfseNumberRangeRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfseNumberRangeRecord = {
  id: string;
  organization_id: string;
  company_id: string;
  environment: FiscalNfseEnvironment;
  model: string;
  series: number;
  number_from: number;
  number_to: number;
  justification: string | null;
  protocol: string | null;
  authorized_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

@Injectable()
export class PrismaNfseNumberRangeRepository
  implements NfseNumberRangeRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfseNumberRange): Promise<NfseNumberRange> {
    const record = await this.prisma.fiscalNfseNumberRange.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfseNumberRange): Promise<NfseNumberRange> {
    const record = await this.prisma.fiscalNfseNumberRange.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfseNumberRange.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfseNumberRange | null> {
    const record = await this.prisma.fiscalNfseNumberRange.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByCompanyEnvSeries(
    companyId: string,
    environment: FiscalNfseEnvironment,
    series: number,
  ): Promise<NfseNumberRange[]> {
    const records = await this.prisma.fiscalNfseNumberRange.findMany({
      where: {
        company_id: companyId,
        environment,
        series,
        deleted_at: null,
      },
      orderBy: { number_from: 'asc' },
    });

    return records.map((record) => this.toDomain(record));
  }

  async findPage(
    params: NfseNumberRangePageParams,
  ): Promise<PageResult<NfseNumberRange>> {
    const where: Prisma.FiscalNfseNumberRangeWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      ...(params.companyId ? { company_id: params.companyId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfseNumberRange.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfseNumberRange.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfseNumberRange,
  ): Prisma.FiscalNfseNumberRangeUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      company_id: data.companyId,
      environment: data.environment,
      model: data.model,
      series: data.series,
      number_from: data.numberFrom,
      number_to: data.numberTo,
      justification: data.justification ?? null,
      protocol: data.protocol ?? null,
      authorized_at: data.authorizedAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private toDomain(record: FiscalNfseNumberRangeRecord): NfseNumberRange {
    return new NfseNumberRange({
      id: record.id,
      organizationId: record.organization_id,
      companyId: record.company_id,
      environment: record.environment,
      model: record.model,
      series: record.series,
      numberFrom: record.number_from,
      numberTo: record.number_to,
      justification: record.justification,
      protocol: record.protocol,
      authorizedAt: record.authorized_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }
}
