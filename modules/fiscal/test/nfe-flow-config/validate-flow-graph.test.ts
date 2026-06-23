import { ValidationError } from '@nexus/shared';
import { randomUUID } from 'crypto';
import {
  DEFAULT_FLOW_55_EDGES,
  DEFAULT_FLOW_55_STEPS,
} from '../../src/nfe-flow-config/constants/default-flow-55';
import { NfeFlowEdge, NfeFlowStep } from '../../src/nfe-flow-config/model';
import { validateFlowGraph } from '../../src/nfe-flow-config/validation/validate-flow-graph';

function buildDefaultSteps(): NfeFlowStep[] {
  const now = new Date();
  const keyToId = new Map(
    DEFAULT_FLOW_55_STEPS.map((t) => [t.stepKey, randomUUID()]),
  );
  return DEFAULT_FLOW_55_STEPS.map((template) =>
    new NfeFlowStep({
      id: keyToId.get(template.stepKey)!,
      flowConfigId: 'config-1',
      stepKey: template.stepKey,
      name: template.name,
      sequence: template.sequence,
      active: template.active,
      type: template.type,
      config: template.config,
      positionX: template.positionX,
      positionY: template.positionY,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }),
  );
}

function buildDefaultEdges(steps: NfeFlowStep[]): NfeFlowEdge[] {
  const keyToId = new Map(steps.map((s) => [s.stepKey, s.id]));
  const now = new Date();
  return DEFAULT_FLOW_55_EDGES.map((template) =>
    new NfeFlowEdge({
      id: randomUUID(),
      flowConfigId: 'config-1',
      sourceStepId: keyToId.get(template.sourceKey)!,
      targetStepId: keyToId.get(template.targetKey)!,
      conditionType: template.conditionType,
      conditionExpression: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }),
  );
}

describe('validateFlowGraph', () => {
  it('accepts default flow for model 55', () => {
    const steps = buildDefaultSteps();
    const edges = buildDefaultEdges(steps);
    expect(() =>
      validateFlowGraph({ model: '55', steps, edges }),
    ).not.toThrow();
  });

  it('rejects flow without required step for model 55', () => {
    const steps = buildDefaultSteps().filter(
      (s) => s.stepKey !== 'NOTIFY_ERROR',
    );
    const edges = buildDefaultEdges(steps);
    expect(() =>
      validateFlowGraph({ model: '55', steps, edges }),
    ).toThrow(ValidationError);
  });

  it('rejects cyclic flow', () => {
    const steps = buildDefaultSteps().slice(0, 2);
    const now = new Date();
    const edges = [
      new NfeFlowEdge({
        id: randomUUID(),
        flowConfigId: 'config-1',
        sourceStepId: steps[0]!.id,
        targetStepId: steps[1]!.id,
        conditionType: 'success',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
      new NfeFlowEdge({
        id: randomUUID(),
        flowConfigId: 'config-1',
        sourceStepId: steps[1]!.id,
        targetStepId: steps[0]!.id,
        conditionType: 'success',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }),
    ];
    expect(() =>
      validateFlowGraph({ model: '55', steps, edges }),
    ).toThrow(ValidationError);
  });
});
