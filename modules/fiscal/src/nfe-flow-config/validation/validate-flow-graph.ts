import { ValidationError } from '@nexus/shared';
import type { FiscalNfeFlowStepKey } from '../../shared/fiscal-nfe-flow-step-key';
import { MODEL_55_REQUIRED_STEPS } from '../constants/default-flow-55';
import { NfeFlowEdge, NfeFlowStep } from '../model';

export interface FlowValidationInput {
  model: string;
  steps: NfeFlowStep[];
  edges: NfeFlowEdge[];
}

export function validateFlowGraph(input: FlowValidationInput): void {
  const errors: string[] = [];
  const activeSteps = input.steps.filter((s) => s.active);

  if (activeSteps.length === 0) {
    errors.push('O fluxo deve ter pelo menos uma etapa ativa.');
  }

  const stepIds = new Set(activeSteps.map((s) => s.id));

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const edge of input.edges) {
    if (!stepIds.has(edge.sourceStepId) || !stepIds.has(edge.targetStepId)) {
      continue;
    }
    outgoing.set(edge.sourceStepId, [
      ...(outgoing.get(edge.sourceStepId) ?? []),
      edge.targetStepId,
    ]);
    incoming.set(edge.targetStepId, [
      ...(incoming.get(edge.targetStepId) ?? []),
      edge.sourceStepId,
    ]);
  }

  const startSteps = activeSteps.filter((s) => !incoming.has(s.id));
  const endSteps = activeSteps.filter((s) => !outgoing.has(s.id));

  if (startSteps.length === 0 && activeSteps.length > 0) {
    errors.push('O fluxo deve ter pelo menos uma etapa inicial.');
  }

  if (endSteps.length === 0 && activeSteps.length > 0) {
    errors.push('O fluxo deve ter pelo menos uma etapa final.');
  }

  const disconnected = activeSteps.filter(
    (s) => !incoming.has(s.id) && !outgoing.has(s.id) && activeSteps.length > 1,
  );
  if (disconnected.length > 0) {
    errors.push('Existem etapas soltas sem conexão.');
  }

  if (hasCycle(activeSteps.map((s) => s.id), input.edges)) {
    errors.push('O fluxo contém ciclo infinito.');
  }

  if (input.model === '55') {
    const presentKeys = new Set(
      activeSteps.map((s) => s.stepKey as FiscalNfeFlowStepKey),
    );
    for (const required of MODEL_55_REQUIRED_STEPS) {
      if (!presentKeys.has(required)) {
        errors.push(`Etapa obrigatória ausente: ${required}.`);
      }
    }
  }

  for (const step of activeSteps) {
    if (step.type === 'wait') {
      const timeout = step.config.timeoutHours;
      const expected = step.config.expectedStatus;
      if (!timeout && !expected) {
        errors.push(`Etapa ${step.name} do tipo WAIT deve ter timeout ou status esperado.`);
      }
    }
    if (step.type === 'action' || step.type === 'validation') {
      if (
        step.stepKey !== 'CREATE_INVOICE' &&
        step.stepKey !== 'NOTIFY_ERROR' &&
        !step.config.onError
      ) {
        const hasOnDivergence = step.config.onDivergence;
        if (!hasOnDivergence) {
          errors.push(`Etapa ${step.name} deve definir ação em caso de erro.`);
        }
      }
    }
  }

  const validationStep = activeSteps.find((s) => s.stepKey === 'VALIDATIONS');
  if (validationStep) {
    const hasErrorPath = input.edges.some(
      (e) =>
        e.sourceStepId === validationStep.id && e.conditionType === 'error',
    );
    if (!hasErrorPath) {
      errors.push('A etapa de validações deve ter caminho de erro configurado.');
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(errors.join(' '));
  }
}

function hasCycle(stepIds: string[], edges: NfeFlowEdge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const id of stepIds) {
    adjacency.set(id, []);
  }
  for (const edge of edges) {
    if (adjacency.has(edge.sourceStepId) && adjacency.has(edge.targetStepId)) {
      adjacency.get(edge.sourceStepId)!.push(edge.targetStepId);
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): boolean {
    visited.add(node);
    stack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (stack.has(neighbor)) {
        return true;
      }
    }
    stack.delete(node);
    return false;
  }

  for (const id of stepIds) {
    if (!visited.has(id) && dfs(id)) {
      return true;
    }
  }
  return false;
}
