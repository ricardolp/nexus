import { NotFoundError, UseCase, ValidationError } from '@nexus/shared';
import { randomUUID } from 'crypto';
import { NfeFlowEdge, NfeFlowStep } from '../model';
import { NfeFlowConfigFull, NfeFlowConfigRepository } from '../provider';

export interface SaveFlowConfigDraftIn {
  configId: string;
  userId?: string | null;
  active?: boolean;
  name?: string;
  steps: Array<{
    id?: string;
    stepKey: string;
    name: string;
    sequence: number;
    active: boolean;
    type: NfeFlowStep['type'];
    config: Record<string, unknown>;
    positionX: number;
    positionY: number;
  }>;
  edges: Array<{
    id?: string;
    sourceStepId: string;
    targetStepId: string;
    conditionType: NfeFlowEdge['conditionType'];
    conditionExpression?: Record<string, unknown> | null;
  }>;
}

export class SaveFlowConfigDraft
  implements UseCase<SaveFlowConfigDraftIn, NfeFlowConfigFull>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: SaveFlowConfigDraftIn): Promise<NfeFlowConfigFull> {
    const existing = await this.repository.findFullById(input.configId);
    if (!existing) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }
    if (existing.config.status === 'published') {
      throw new ValidationError(
        'Versão publicada não pode ser editada diretamente. Duplique para criar um rascunho.',
      );
    }

    const config = existing.config.clone({
      name: input.name ?? existing.config.name,
      active: input.active ?? existing.config.active,
      updatedBy: input.userId ?? existing.config.updatedBy,
    });
    config.validate();

    const steps = input.steps.map(
      (s) =>
        new NfeFlowStep({
          id: s.id ?? randomUUID(),
          flowConfigId: config.id,
          stepKey: s.stepKey,
          name: s.name,
          sequence: s.sequence,
          active: s.active,
          type: s.type,
          config: s.config,
          positionX: s.positionX,
          positionY: s.positionY,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          deletedAt: null,
        }),
    );

    const edges = input.edges.map(
      (e) =>
        new NfeFlowEdge({
          id: e.id ?? randomUUID(),
          flowConfigId: config.id,
          sourceStepId: e.sourceStepId,
          targetStepId: e.targetStepId,
          conditionType: e.conditionType,
          conditionExpression: e.conditionExpression ?? null,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          deletedAt: null,
        }),
    );

    for (const step of steps) step.validate();
    for (const edge of edges) edge.validate();

    await this.repository.update(config);
    return this.repository.saveDraft({ config, steps, edges });
  }
}
