import { NotFoundError } from '@nexus/shared';
import { randomUUID } from 'crypto';
import type { FiscalNfeFlowEdgeCondition } from '../shared/fiscal-nfe-flow-edge-condition';
import type { FiscalNfeFlowInstanceStatus } from '../shared/fiscal-nfe-flow-instance-status';
import { NfeFlowConfigRepository } from '../nfe-flow-config/provider';
import { NfeFlowStep } from '../nfe-flow-config/model';
import {
  NfeFlowInstance,
  NfeFlowStepExecution,
} from '../nfe-flow-instance/model';
import { NfeFlowInstanceRepository } from '../nfe-flow-instance/provider';
import { NfeInboundProcessRepository } from '../nfe-inbound-process/provider';
import { NfeInboundProcess } from '../nfe-inbound-process/model';
import { inboundStatusRank } from '../nfe-inbound-process/inbound-status';
import {
  STEP_KEY_SUCCESS_INBOUND_STATUS,
  STEP_KEY_TO_INBOUND_STATUS,
} from './step-inbound-bridge';
import {
  createDefaultStepHandlers,
  NfeFlowStepHandler,
  NfeFlowStepHandlerResult,
} from './step-handlers';

export interface RunNextStepIn {
  instanceId: string;
  dryRun?: boolean;
  accessKey?: string;
  purchaseOrder?: string;
}

export interface RunNextStepOut {
  instance: NfeFlowInstance;
  execution: NfeFlowStepExecution;
  completed: boolean;
}

export class NfeFlowEngine {
  private readonly handlers: Map<string, NfeFlowStepHandler>;

  constructor(
    private readonly configRepository: NfeFlowConfigRepository,
    private readonly instanceRepository: NfeFlowInstanceRepository,
    private readonly inboundRepository: NfeInboundProcessRepository,
    handlers: NfeFlowStepHandler[] = createDefaultStepHandlers(),
  ) {
    this.handlers = new Map(handlers.map((h) => [h.stepKey, h]));
  }

  async startForDocument(input: {
    organizationId: string;
    companyId: string;
    documentId: string;
    model: string;
  }): Promise<NfeFlowInstance> {
    let configFull = await this.configRepository.findActivePublished(
      input.organizationId,
      input.companyId,
      input.model,
    );
    if (!configFull) {
      configFull = await this.configRepository.findActivePublished(
        input.organizationId,
        null,
        input.model,
      );
    }
    if (!configFull) {
      throw new NotFoundError(
        'Nenhuma configuração de fluxo publicada para este modelo.',
      );
    }

    const now = new Date();
    const firstStep = configFull.steps
      .filter((s) => s.active)
      .sort((a, b) => a.sequence - b.sequence)[0];

    const instance = new NfeFlowInstance({
      id: randomUUID(),
      flowConfigId: configFull.config.id,
      documentId: input.documentId,
      model: input.model,
      status: 'ready',
      currentStepId: firstStep?.id ?? null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    instance.validate();

    await this.instanceRepository.create(instance);
    if (firstStep) {
      await this.runNextStep({ instanceId: instance.id });
    }
    return instance;
  }

  async runNextStep(input: RunNextStepIn): Promise<RunNextStepOut> {
    const full = await this.instanceRepository.findFullById(input.instanceId);
    if (!full) {
      throw new NotFoundError('Instância de fluxo não encontrada.');
    }

    const configFull = await this.configRepository.findFullById(
      full.instance.flowConfigId,
    );
    if (!configFull) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }

    const currentStep = configFull.steps.find(
      (s) => s.id === full.instance.currentStepId,
    );
    if (!currentStep) {
      const completed = full.instance.clone({
        status: 'completed',
        finishedAt: new Date(),
      });
      await this.instanceRepository.update(completed);
      return {
        instance: completed,
        execution: full.executions[full.executions.length - 1]!,
        completed: true,
      };
    }

    const handler = this.handlers.get(currentStep.stepKey);
    const result = handler
      ? await handler.execute({
          documentId: full.instance.documentId,
          step: currentStep,
          dryRun: input.dryRun,
          accessKey: input.accessKey,
          purchaseOrder: input.purchaseOrder,
        })
      : {
          status: 'success' as const,
          message: `Etapa ${currentStep.name} executada.`,
        };

    const now = new Date();
    const execution = new NfeFlowStepExecution({
      id: randomUUID(),
      instanceId: full.instance.id,
      stepKey: currentStep.stepKey,
      status: result.status,
      message: result.message,
      payload: result.payload ?? null,
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    execution.validate();

    if (!input.dryRun) {
      await this.syncInboundStatus(
        full.instance.documentId,
        currentStep,
        result,
      );
    }

    const nextStepId = this.resolveNextStepId(
      configFull.steps,
      configFull.edges,
      currentStep.id,
      result,
    );

    const instanceStatus = this.resolveInstanceStatus(
      result.status,
      nextStepId,
    );

    const updatedInstance = full.instance.clone({
      status: instanceStatus,
      currentStepId: nextStepId,
      finishedAt: nextStepId ? null : new Date(),
    });
    updatedInstance.validate();

    await this.instanceRepository.saveWithExecutions(updatedInstance, [
      ...full.executions,
      execution,
    ]);

    return {
      instance: updatedInstance,
      execution,
      completed: !nextStepId,
    };
  }

  private resolveNextStepId(
    steps: NfeFlowStep[],
    edges: { sourceStepId: string; targetStepId: string; conditionType: FiscalNfeFlowEdgeCondition }[],
    currentStepId: string,
    result: NfeFlowStepHandlerResult,
  ): string | null {
    const condition = mapResultToCondition(result.status);
    const edge = edges.find(
      (e) =>
        e.sourceStepId === currentStepId && e.conditionType === condition,
    );
    if (edge) {
      const target = steps.find((s) => s.id === edge.targetStepId);
      return target?.active ? edge.targetStepId : null;
    }

    const successEdge = edges.find(
      (e) => e.sourceStepId === currentStepId && e.conditionType === 'success',
    );
    if (successEdge && result.status === 'success') {
      return successEdge.targetStepId;
    }

    return null;
  }

  private resolveInstanceStatus(
    executionStatus: NfeFlowStepExecution['status'],
    nextStepId: string | null,
  ): FiscalNfeFlowInstanceStatus {
    if (!nextStepId) {
      if (executionStatus === 'error') return 'error';
      if (executionStatus === 'waiting_external_status') return 'waiting_gate';
      return 'completed';
    }
    if (executionStatus === 'waiting_external_status') return 'waiting_gate';
    if (executionStatus === 'error') return 'error';
    return 'processing';
  }

  private async syncInboundStatus(
    documentId: string,
    step: NfeFlowStep,
    result: NfeFlowStepHandlerResult,
  ): Promise<void> {
    const inbound = await this.inboundRepository.findByDocumentId(documentId);
    if (!inbound) return;

    const stepKey = step.stepKey as keyof typeof STEP_KEY_TO_INBOUND_STATUS;
    const status =
      result.status === 'success' || result.status === 'waiting_external_status'
        ? STEP_KEY_SUCCESS_INBOUND_STATUS[stepKey] ??
          STEP_KEY_TO_INBOUND_STATUS[stepKey]
        : result.status === 'error'
          ? 'inbound_error'
          : STEP_KEY_TO_INBOUND_STATUS[stepKey];

    if (!status) return;

    const currentRank = inboundStatusRank(inbound.inboundStatus);
    const nextRank = inboundStatusRank(status);
    if (
      status !== 'inbound_error' &&
      status !== 'rejected_inbound' &&
      nextRank < currentRank
    ) {
      return;
    }

    const updated = inbound.clone({
      inboundStatus: status,
      statusChangedAt: new Date(),
    });
    await this.inboundRepository.update(updated);
  }
}

function mapResultToCondition(
  status: NfeFlowStepExecution['status'],
): FiscalNfeFlowEdgeCondition {
  if (status === 'error') return 'error';
  if (status === 'waiting_external_status') return 'wait';
  return 'success';
}
