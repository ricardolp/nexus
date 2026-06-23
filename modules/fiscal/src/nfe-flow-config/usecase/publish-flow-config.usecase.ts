import { NotFoundError, UseCase } from '@nexus/shared';
import { randomUUID } from 'crypto';
import { NfeFlowAuditLog } from '../model';
import {
  NfeFlowAuditLogRepository,
  NfeFlowConfigFull,
  NfeFlowConfigRepository,
} from '../provider';
import { validateFlowGraph } from '../validation/validate-flow-graph';

export interface PublishFlowConfigIn {
  configId: string;
  userId?: string | null;
  reason?: string | null;
}

export class PublishFlowConfig
  implements UseCase<PublishFlowConfigIn, NfeFlowConfigFull>
{
  constructor(
    private readonly configRepository: NfeFlowConfigRepository,
    private readonly auditRepository: NfeFlowAuditLogRepository,
  ) {}

  async execute(input: PublishFlowConfigIn): Promise<NfeFlowConfigFull> {
    const full = await this.configRepository.findFullById(input.configId);
    if (!full) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }

    validateFlowGraph({
      model: full.config.model,
      steps: full.steps,
      edges: full.edges,
    });

    await this.configRepository.archivePublishedByScope(
      full.config.organizationId,
      full.config.companyId ?? null,
      full.config.model,
      full.config.id,
    );

    const published = full.config.clone({
      status: 'published',
      active: true,
      updatedBy: input.userId ?? full.config.updatedBy,
    });
    published.validate();
    await this.configRepository.update(published);

    const audit = new NfeFlowAuditLog({
      id: randomUUID(),
      flowConfigId: full.config.id,
      version: full.config.version,
      userId: input.userId ?? null,
      action: 'PUBLISH',
      before: { status: full.config.status },
      after: { status: 'published', active: true },
      reason: input.reason ?? null,
      createdAt: published.updatedAt,
      updatedAt: published.updatedAt,
      deletedAt: null,
    });
    audit.validate();
    await this.auditRepository.create(audit);

    const updated = await this.configRepository.findFullById(input.configId);
    return updated!;
  }
}
