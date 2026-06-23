import { Injectable } from '@nestjs/common';
import {
  FiscalNfeFlowConfigStatus,
  FiscalNfeFlowEdgeCondition,
  FiscalNfeFlowStepType,
  NfeFlowAuditLog,
  NfeFlowAuditLogPageParams,
  NfeFlowAuditLogRepository,
  NfeFlowConfig,
  NfeFlowConfigFull,
  NfeFlowConfigPageParams,
  NfeFlowConfigRepository,
  NfeFlowEdge,
  NfeFlowStep,
  SaveFlowConfigDraftInput,
} from '@nexus/fiscal';
import { PageResult } from '@nexus/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';

@Injectable()
export class PrismaNfeFlowConfigRepository implements NfeFlowConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeFlowConfig): Promise<NfeFlowConfig> {
    const record = await this.prisma.fiscalNfeFlowConfig.create({
      data: this.configToPersistence(data),
    });
    return this.configToDomain(record);
  }

  async update(data: NfeFlowConfig): Promise<NfeFlowConfig> {
    const record = await this.prisma.fiscalNfeFlowConfig.update({
      where: { id: data.id },
      data: this.configToPersistence(data),
    });
    return this.configToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.fiscalNfeFlowConfig.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async findById(id: string): Promise<NfeFlowConfig | null> {
    const record = await this.prisma.fiscalNfeFlowConfig.findFirst({
      where: { id, deleted_at: null },
    });
    return record ? this.configToDomain(record) : null;
  }

  async findPage(
    params: NfeFlowConfigPageParams,
  ): Promise<PageResult<NfeFlowConfig>> {
    const where: Prisma.FiscalNfeFlowConfigWhereInput = {
      deleted_at: null,
      organization_id: params.organizationId,
      ...(params.companyId !== undefined
        ? { company_id: params.companyId }
        : {}),
      ...(params.model ? { model: params.model } : {}),
    };
    const skip = (params.page - 1) * params.perPage;

    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeFlowConfig.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: [{ model: 'asc' }, { version: 'desc' }],
      }),
      this.prisma.fiscalNfeFlowConfig.count({ where }),
    ]);

    return {
      items: records.map((r) => this.configToDomain(r)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  async findFullById(id: string): Promise<NfeFlowConfigFull | null> {
    const record = await this.prisma.fiscalNfeFlowConfig.findFirst({
      where: { id, deleted_at: null },
      include: {
        steps: { where: { deleted_at: null }, orderBy: { sequence: 'asc' } },
        edges: { where: { deleted_at: null } },
      },
    });
    if (!record) return null;
    return {
      config: this.configToDomain(record),
      steps: record.steps.map((s) => this.stepToDomain(s)),
      edges: record.edges.map((e) => this.edgeToDomain(e)),
    };
  }

  async findActivePublished(
    organizationId: string,
    companyId: string | null,
    model: string,
  ): Promise<NfeFlowConfigFull | null> {
    const record = await this.prisma.fiscalNfeFlowConfig.findFirst({
      where: {
        deleted_at: null,
        organization_id: organizationId,
        company_id: companyId,
        model,
        status: 'published',
        active: true,
      },
      include: {
        steps: { where: { deleted_at: null }, orderBy: { sequence: 'asc' } },
        edges: { where: { deleted_at: null } },
      },
    });
    if (!record) return null;
    return {
      config: this.configToDomain(record),
      steps: record.steps.map((s) => this.stepToDomain(s)),
      edges: record.edges.map((e) => this.edgeToDomain(e)),
    };
  }

  async findPublishedByScope(
    organizationId: string,
    companyId: string | null,
    model: string,
  ): Promise<NfeFlowConfig | null> {
    const record = await this.prisma.fiscalNfeFlowConfig.findFirst({
      where: {
        deleted_at: null,
        organization_id: organizationId,
        company_id: companyId,
        model,
        status: 'published',
        active: true,
      },
    });
    return record ? this.configToDomain(record) : null;
  }

  async archivePublishedByScope(
    organizationId: string,
    companyId: string | null,
    model: string,
    excludeId?: string,
  ): Promise<void> {
    await this.prisma.fiscalNfeFlowConfig.updateMany({
      where: {
        deleted_at: null,
        organization_id: organizationId,
        company_id: companyId,
        model,
        status: 'published',
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      data: {
        status: 'archived',
        active: false,
        updated_at: new Date(),
      },
    });
  }

  async saveDraft(input: SaveFlowConfigDraftInput): Promise<NfeFlowConfigFull> {
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalNfeFlowStep.deleteMany({
        where: { flow_config_id: input.config.id },
      });
      await tx.fiscalNfeFlowEdge.deleteMany({
        where: { flow_config_id: input.config.id },
      });

      if (input.steps.length > 0) {
        await tx.fiscalNfeFlowStep.createMany({
          data: input.steps.map((s) => this.stepToPersistence(s)),
        });
      }
      if (input.edges.length > 0) {
        await tx.fiscalNfeFlowEdge.createMany({
          data: input.edges.map((e) => this.edgeToPersistence(e)),
        });
      }

      await tx.fiscalNfeFlowConfig.update({
        where: { id: input.config.id },
        data: this.configToPersistence(input.config),
      });
    });

    return (await this.findFullById(input.config.id))!;
  }

  private configToDomain(record: {
    id: string;
    organization_id: string;
    company_id: string | null;
    model: string;
    name: string;
    version: string;
    active: boolean;
    status: FiscalNfeFlowConfigStatus;
    created_by: string | null;
    updated_by: string | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): NfeFlowConfig {
    return new NfeFlowConfig({
      id: record.id,
      organizationId: record.organization_id,
      companyId: record.company_id,
      model: record.model,
      name: record.name,
      version: record.version,
      active: record.active,
      status: record.status,
      createdBy: record.created_by,
      updatedBy: record.updated_by,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }

  private configToPersistence(
    data: NfeFlowConfig,
  ): Prisma.FiscalNfeFlowConfigUncheckedCreateInput {
    return {
      id: data.id,
      organization_id: data.organizationId,
      company_id: data.companyId ?? null,
      model: data.model,
      name: data.name,
      version: data.version,
      active: data.active,
      status: data.status,
      created_by: data.createdBy ?? null,
      updated_by: data.updatedBy ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private stepToDomain(record: {
    id: string;
    flow_config_id: string;
    step_key: string;
    name: string;
    sequence: number;
    active: boolean;
    type: FiscalNfeFlowStepType;
    config: Prisma.JsonValue;
    position_x: number;
    position_y: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): NfeFlowStep {
    return new NfeFlowStep({
      id: record.id,
      flowConfigId: record.flow_config_id,
      stepKey: record.step_key,
      name: record.name,
      sequence: record.sequence,
      active: record.active,
      type: record.type,
      config: (record.config as Record<string, unknown>) ?? {},
      positionX: record.position_x,
      positionY: record.position_y,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }

  private stepToPersistence(
    data: NfeFlowStep,
  ): Prisma.FiscalNfeFlowStepUncheckedCreateInput {
    return {
      id: data.id,
      flow_config_id: data.flowConfigId,
      step_key: data.stepKey,
      name: data.name,
      sequence: data.sequence,
      active: data.active,
      type: data.type,
      config: data.config as Prisma.InputJsonValue,
      position_x: data.positionX,
      position_y: data.positionY,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }

  private edgeToDomain(record: {
    id: string;
    flow_config_id: string;
    source_step_id: string;
    target_step_id: string;
    condition_type: FiscalNfeFlowEdgeCondition;
    condition_expression: Prisma.JsonValue;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }): NfeFlowEdge {
    return new NfeFlowEdge({
      id: record.id,
      flowConfigId: record.flow_config_id,
      sourceStepId: record.source_step_id,
      targetStepId: record.target_step_id,
      conditionType: record.condition_type,
      conditionExpression:
        (record.condition_expression as Record<string, unknown>) ?? null,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
      deletedAt: record.deleted_at,
    });
  }

  private edgeToPersistence(
    data: NfeFlowEdge,
  ): Prisma.FiscalNfeFlowEdgeUncheckedCreateInput {
    return {
      id: data.id,
      flow_config_id: data.flowConfigId,
      source_step_id: data.sourceStepId,
      target_step_id: data.targetStepId,
      condition_type: data.conditionType,
      condition_expression: (data.conditionExpression ??
        undefined) as Prisma.InputJsonValue,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
      deleted_at: data.deletedAt ?? null,
    };
  }
}

@Injectable()
export class PrismaNfeFlowAuditLogRepository
  implements NfeFlowAuditLogRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async create(data: NfeFlowAuditLog): Promise<NfeFlowAuditLog> {
    const record = await this.prisma.fiscalNfeFlowAuditLog.create({
      data: {
        id: data.id,
        flow_config_id: data.flowConfigId,
        version: data.version,
        user_id: data.userId ?? null,
        action: data.action,
        step_key: data.stepKey ?? null,
        before: (data.before ?? undefined) as Prisma.InputJsonValue,
        after: (data.after ?? undefined) as Prisma.InputJsonValue,
        reason: data.reason ?? null,
        created_at: data.createdAt,
      },
    });
    return this.toDomain(record);
  }

  async update(data: NfeFlowAuditLog): Promise<NfeFlowAuditLog> {
    return data;
  }

  async delete(): Promise<void> {}

  async findById(): Promise<NfeFlowAuditLog | null> {
    return null;
  }

  async findPage(
    params: NfeFlowAuditLogPageParams,
  ): Promise<PageResult<NfeFlowAuditLog>> {
    const where = { flow_config_id: params.flowConfigId };
    const skip = (params.page - 1) * params.perPage;
    const [records, total] = await Promise.all([
      this.prisma.fiscalNfeFlowAuditLog.findMany({
        where,
        skip,
        take: params.perPage,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.fiscalNfeFlowAuditLog.count({ where }),
    ]);
    return {
      items: records.map((r) => this.toDomain(r)),
      page: params.page,
      perPage: params.perPage,
      total,
    };
  }

  private toDomain(record: {
    id: string;
    flow_config_id: string;
    version: string;
    user_id: string | null;
    action: string;
    step_key: string | null;
    before: Prisma.JsonValue;
    after: Prisma.JsonValue;
    reason: string | null;
    created_at: Date;
  }): NfeFlowAuditLog {
    return new NfeFlowAuditLog({
      id: record.id,
      flowConfigId: record.flow_config_id,
      version: record.version,
      userId: record.user_id,
      action: record.action,
      stepKey: record.step_key,
      before: (record.before as Record<string, unknown>) ?? null,
      after: (record.after as Record<string, unknown>) ?? null,
      reason: record.reason,
      createdAt: record.created_at,
      updatedAt: record.created_at,
      deletedAt: null,
    });
  }
}
