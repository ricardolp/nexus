import { UseCase } from '@nexus/shared';
import { randomUUID } from 'crypto';
import {
  DEFAULT_FLOW_55_EDGES,
  DEFAULT_FLOW_55_NAME,
  DEFAULT_FLOW_55_STEPS,
  DEFAULT_FLOW_55_VERSION,
} from '../constants/default-flow-55';
import { NfeFlowConfig, NfeFlowEdge, NfeFlowStep } from '../model';
import { NfeFlowConfigFull, NfeFlowConfigRepository } from '../provider';

export interface CreateFlowConfigDraftIn {
  organizationId: string;
  companyId?: string | null;
  model: string;
  name?: string;
  userId?: string | null;
  seedDefault?: boolean;
}

export class CreateFlowConfigDraft
  implements UseCase<CreateFlowConfigDraftIn, NfeFlowConfigFull>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: CreateFlowConfigDraftIn): Promise<NfeFlowConfigFull> {
    const now = new Date();
    const config = new NfeFlowConfig({
      id: randomUUID(),
      organizationId: input.organizationId,
      companyId: input.companyId ?? null,
      model: input.model,
      name: input.name ?? DEFAULT_FLOW_55_NAME,
      version: DEFAULT_FLOW_55_VERSION,
      active: false,
      status: 'draft',
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    config.validate();

    const steps: NfeFlowStep[] = [];
    const edges: NfeFlowEdge[] = [];
    const keyToId = new Map<string, string>();

    if (input.seedDefault !== false && input.model === '55') {
      for (const template of DEFAULT_FLOW_55_STEPS) {
        const id = randomUUID();
        keyToId.set(template.stepKey, id);
        steps.push(
          new NfeFlowStep({
            id,
            flowConfigId: config.id,
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

      for (const template of DEFAULT_FLOW_55_EDGES) {
        const sourceId = keyToId.get(template.sourceKey);
        const targetId = keyToId.get(template.targetKey);
        if (!sourceId || !targetId) continue;
        edges.push(
          new NfeFlowEdge({
            id: randomUUID(),
            flowConfigId: config.id,
            sourceStepId: sourceId,
            targetStepId: targetId,
            conditionType: template.conditionType,
            conditionExpression: null,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          }),
        );
      }
    }

    for (const step of steps) step.validate();
    for (const edge of edges) edge.validate();

    await this.repository.create(config);
    return this.repository.saveDraft({ config, steps, edges });
  }
}
