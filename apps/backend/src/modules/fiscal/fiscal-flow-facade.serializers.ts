import {
  NfeFlowAuditLog,
  NfeFlowConfig,
  NfeFlowConfigFull,
  NfeFlowEdge,
  NfeFlowInstance,
  NfeFlowInstanceFull,
  NfeFlowStep,
  NfeFlowStepExecution,
} from '@nexus/fiscal';

export function serializeNfeFlowConfig(config: NfeFlowConfig) {
  return {
    id: config.id,
    organizationId: config.organizationId,
    companyId: config.companyId,
    model: config.model,
    name: config.name,
    version: config.version,
    active: config.active,
    status: config.status,
    createdBy: config.createdBy,
    updatedBy: config.updatedBy,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function serializeNfeFlowStep(step: NfeFlowStep) {
  return {
    id: step.id,
    flowConfigId: step.flowConfigId,
    stepKey: step.stepKey,
    name: step.name,
    sequence: step.sequence,
    active: step.active,
    type: step.type,
    config: step.config,
    positionX: step.positionX,
    positionY: step.positionY,
  };
}

export function serializeNfeFlowEdge(edge: NfeFlowEdge) {
  return {
    id: edge.id,
    flowConfigId: edge.flowConfigId,
    sourceStepId: edge.sourceStepId,
    targetStepId: edge.targetStepId,
    conditionType: edge.conditionType,
    conditionExpression: edge.conditionExpression,
  };
}

export function serializeNfeFlowConfigFull(full: NfeFlowConfigFull) {
  return {
    ...serializeNfeFlowConfig(full.config),
    steps: full.steps.map(serializeNfeFlowStep),
    edges: full.edges.map(serializeNfeFlowEdge),
  };
}

export function serializeNfeFlowAuditLog(log: NfeFlowAuditLog) {
  return {
    id: log.id,
    flowConfigId: log.flowConfigId,
    version: log.version,
    userId: log.userId,
    action: log.action,
    stepKey: log.stepKey,
    before: log.before,
    after: log.after,
    reason: log.reason,
    createdAt: log.createdAt.toISOString(),
  };
}

export function serializeNfeFlowInstance(instance: NfeFlowInstance) {
  return {
    id: instance.id,
    flowConfigId: instance.flowConfigId,
    documentId: instance.documentId,
    model: instance.model,
    status: instance.status,
    currentStepId: instance.currentStepId,
    startedAt: instance.startedAt.toISOString(),
    finishedAt: instance.finishedAt?.toISOString() ?? null,
  };
}

export function serializeNfeFlowStepExecution(execution: NfeFlowStepExecution) {
  return {
    id: execution.id,
    instanceId: execution.instanceId,
    stepKey: execution.stepKey,
    status: execution.status,
    message: execution.message,
    payload: execution.payload,
    startedAt: execution.startedAt?.toISOString() ?? null,
    finishedAt: execution.finishedAt?.toISOString() ?? null,
  };
}

export function serializeNfeFlowInstanceFull(full: NfeFlowInstanceFull) {
  return {
    ...serializeNfeFlowInstance(full.instance),
    executions: full.executions.map(serializeNfeFlowStepExecution),
  };
}
