import { Injectable } from '@nestjs/common';
import {
  FiscalNfeEnvironment,
  NfeNumberRange,
  NfeNumberRangePageParams,
  NfeNumberRangeRepository,
} from '@nexus/fiscal';
import { Prisma } from '@prisma/client';
import { PageResult } from '@nexus/shared';
import { PrismaService } from '../../db/prisma.service';

type FiscalNfeNumberRangeRecord = {
  id: string;
  organization_id: string;
  company_id: string;
  environment: FiscalNfeEnvironment;
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
export class PrismaNfeNumberRangeRepository implements NfeNumberRangeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeNumberRange): Promise<NfeNumberRange> {
    const record = await this.prisma.fiscalNfeNumberRange.create({
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async update(data: NfeNumberRange): Promise<NfeNumberRange> {
    const record = await this.prisma.fiscalNfeNumberRange.update({
      where: { id: data.id },
      data: this.toPersistence(data),
    });

    return this.toDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeNumberRange.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeNumberRange | null> {
    const record = await this.prisma.fiscalNfeNumberRange.findFirst({
      where: { id, deleted_at: null },
    });

    return record ? this.toDomain(record) : null;
  }

  async findByCompanyEnvSeries(
    companyId: string,
    environment: FiscalNfeEnvironment,
    series: number,
  ): Promise<NfeNumberRange[]> {
    const records = await this.prisma.fiscalNfeNumberRange.findMany({
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
    params: NfeNumberRangePageParams,
  ): Promise<PageResult<NfeNumberRange>> {
    const where: Prisma.FiscalNfeNumberRangeWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      ...(params.companyId ? { company_id: params.companyId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeNumberRange.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeNumberRange.count({ where }),
    ]);

    return {
      items: records.map((record) => this.toDomain(record)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toPersistence(
    data: NfeNumberRange,
  ): Prisma.FiscalNfeNumberRangeUncheckedCreateInput {
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

  private toDomain(record: FiscalNfeNumberRangeRecord): NfeNumberRange {
    return new NfeNumberRange({
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
