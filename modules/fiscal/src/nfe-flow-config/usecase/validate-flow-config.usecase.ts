import { UseCase } from '@nexus/shared';
import { NfeFlowConfigFull, NfeFlowConfigRepository } from '../provider';
import { validateFlowGraph } from '../validation/validate-flow-graph';

export interface ValidateFlowConfigIn {
  configId: string;
}

export interface ValidateFlowConfigOut {
  valid: boolean;
}

export class ValidateFlowConfig
  implements UseCase<ValidateFlowConfigIn, ValidateFlowConfigOut>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: ValidateFlowConfigIn): Promise<ValidateFlowConfigOut> {
    const full = await this.repository.findFullById(input.configId);
    if (!full) {
      return { valid: false };
    }
    validateFlowGraph({
      model: full.config.model,
      steps: full.steps,
      edges: full.edges,
    });
    return { valid: true };
  }
}
