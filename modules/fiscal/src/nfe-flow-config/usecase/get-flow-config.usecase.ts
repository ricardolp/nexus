import { NotFoundError, UseCase } from '@nexus/shared';
import { NfeFlowConfigFull, NfeFlowConfigRepository } from '../provider';

export interface GetFlowConfigIn {
  configId: string;
}

export class GetFlowConfig
  implements UseCase<GetFlowConfigIn, NfeFlowConfigFull>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  async execute(input: GetFlowConfigIn): Promise<NfeFlowConfigFull> {
    const full = await this.repository.findFullById(input.configId);
    if (!full) {
      throw new NotFoundError('Configuração de fluxo não encontrada.');
    }
    return full;
  }
}
