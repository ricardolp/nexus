import { Injectable } from '@nestjs/common';
import {
  FiscalNfeFlowInstanceStatus,
  FiscalNfeFlowStepExecutionStatus,
  NfeFlowInstance,
  NfeFlowInstanceFull,
  NfeFlowInstancePageParams,
  NfeFlowInstanceRepository,
  NfeFlowStepExecution,
} from '@nexus/fiscal';
import { PageResult } from '@nexus/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaNfeFlowInstanceRepository
  implements NfeFlowInstanceRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeFlowInstance): Promise<NfeFlowInstance> {
    const record = await this.prisma.fiscalNfeFlowInstance.create({
      data: this.instanceToPersistence(data),
    });
    return this.instanceToDomain(record);
  }

  async update(data: NfeFlowInstance): Promise<NfeFlowInstance> {
    const record = await this.prisma.fiscalNfeFlowInstance.update({
      where: { id: data.id },
      data: this.instanceToPersistence(data),
    });
    return this.instanceToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeFlowInstance.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeFlowInstance | null> {
    const record = await this.prisma.fiscalNfeFlowInstance.findFirst({
      where: { id, deleted_at: null },
    });
    return record ? this.instanceToDomain(record) : null;
  }

  async findPage(
    params: NfeFlowInstancePageParams,
  ): Promise<PageResult<NfeFlowInstance>> {
    const where: Prisma.FiscalNfeFlowInstanceWhereInput = {
      deleted_at: null,
      ...(params.flowConfigId ? { flow_config_id: params.flowConfigId } : {}),
      ...(params.documentId ? { document_id: params.documentId } : {}),
    };
    const skip = (params.page - 1) * params.perPage;
    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeFlowInstance.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeFlowInstance.count({ where }),
    ]);
    return {
      items: records.map((r) => this.instanceToDomain(r)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findByDocumentId(documentId: string): Promise<NfeFlowInstanceFull | null> {
    const record = await this.prisma.fiscalNfeFlowInstance.findFirst({
      where: { document_id: documentId, deleted_at: null },
      include: {
        executions: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!record) return null;
    return {
      instance: this.instanceToDomain(record),
      executions: record.executions.map((e) => this.executionToDomain(e)),
    };
  }

  async findFullById(id: string): Promise<NfeFlowInstanceFull | null> {
    const record = await this.prisma.fiscalNfeFlowInstance.findFirst({
      where: { id, deleted_at: null },
      include: {
        executions: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!record) return null;
    return {
      instance: this.instanceToDomain(record),
      executions: record.executions.map((e) => this.executionToDomain(e)),
    };
  }

  async saveWithExecutions(
    instance: NfeFlowInstance,
    executions: NfeFlowStepExecution[],
  ): Promise<NfeFlowInstanceFull> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalNfeFlowInstance.update({
        where: { id: instance.id },
        data: this.instanceToPersistence(instance),
      });
      const latest = executions[executions.length - 1];
      if (latest) {
        await tx.fiscalNfeFlowStepExecution.create({
          data: this.executionToPersistence(latest),
        });
      }
    });
    return (await this.findFullById(instance.id))!;
  }

  private instanceToDomain(record: {
    id: string;
    flow_config_id: string;
    document_id: string;
    model: string;
    status: FiscalNfeFlowInstanceStatus;
    current_step_id: string | null;
    started_at: Date;
    finished_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): NfeFlowInstance {
    return new NfeFlowInstance({
      id: record.id,
      flowConfigId: record.flow_config_id,
      documentId: record.document_id,
      model: record.model,
      status: record.status,
      currentStepId: record.current_step_id,
      startedAt: record.started_at,
      finishedAt: record.finished_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }

  private instanceToPersistence(
    data: NfeFlowInstance,
  ): Prisma.FiscalNfeFlowInstanceUncheckedCreateInput {
    return {
      id: data.id,
      flow_config_id: data.flowConfigId,
      document_id: data.documentId,
      model: data.model,
      status: data.status,
      current_step_id: data.currentStepId ?? null,
      started_at: data.startedAt,
      finished_at: data.finishedAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private executionToDomain(record: {
    id: string;
    instance_id: string;
    step_key: string;
    status: FiscalNfeFlowStepExecutionStatus;
    message: string | null;
    payload: Prisma.JsonValue;
    started_at: Date | null;
    finished_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): NfeFlowStepExecution {
    return new NfeFlowStepExecution({
      id: record.id,
      instanceId: record.instance_id,
      stepKey: record.step_key,
      status: record.status,
      message: record.message,
      payload: (record.payload as Record<string, unknown>) ?? null,
      startedAt: record.started_at,
      finishedAt: record.finished_at,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: null,
    });
  }

  private executionToPersistence(
    data: NfeFlowStepExecution,
  ): Prisma.FiscalNfeFlowStepExecutionUncheckedCreateInput {
    return {
      id: data.id,
      instance_id: data.instanceId,
      step_key: data.stepKey,
      status: data.status,
      message: data.message ?? null,
      payload: (data.payload ?? undefined) as Prisma.InputJsonValue,
      started_at: data.startedAt ?? null,
      finished_at: data.finishedAt ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };
  }
}
