import { NotFoundError, UseCase } from '@nexus/shared';
import { randomUUID } from 'crypto';
import { NfeFlowConfig, NfeFlowEdge, NfeFlowStep } from '../model';
import { NfeFlowConfigFull, NfeFlowConfigRepository } from '../provider';

export interface DuplicateFlowConfigIn {
  configId: string;
  userId?: string | null;
}

export class DuplicateFlowConfig
  implements UseCase<DuplicateFlowConfigIn, NfeFlowConfigFull>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: DuplicateFlowConfigIn): Promise<NfeFlowConfigFull> {
    const source = await this.repository.findFullById(input.configId);
    if (!source) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }

    const now = new Date();
    const nextVersion = bumpVersion(source.config.version);
    const config = new NfeFlowConfig({
      id: randomUUID(),
      organizationId: source.config.organizationId,
      companyId: source.config.companyId,
      model: source.config.model,
      name: `${source.config.name} (cópia)`,
      version: nextVersion,
      active: false,
      status: 'draft',
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    config.validate();
    await this.repository.create(config);

    const keyToNewId = new Map<string, string>();
    const steps = source.steps.map((s) => {
      const id = randomUUID();
      keyToNewId.set(s.id, id);
      return new NfeFlowStep({
        id,
        flowConfigId: config.id,
        stepKey: s.stepKey,
        name: s.name,
        sequence: s.sequence,
        active: s.active,
        type: s.type,
        config: { ...s.config },
        positionX: s.positionX,
        positionY: s.positionY,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    });

    const edges = source.edges.map(
      (e) =>
        new NfeFlowEdge({
          id: randomUUID(),
          flowConfigId: config.id,
          sourceStepId: keyToNewId.get(e.sourceStepId) ?? e.sourceStepId,
          targetStepId: keyToNewId.get(e.targetStepId) ?? e.targetStepId,
          conditionType: e.conditionType,
          conditionExpression: e.conditionExpression
            ? { ...e.conditionExpression }
            : null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
    );

    return this.repository.saveDraft({ config, steps, edges });
  }
}

function bumpVersion(version: string): string {
  const parts = version.split('.');
  const minor = Number(parts[1] ?? 0) + 1;
  return `${parts[0] ?? '1'}.${minor}`;
}
