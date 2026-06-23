import { UseCase } from '@nexus/shared';
import { NfeFlowConfigPageParams, NfeFlowConfigRepository } from '../provider';
import { PageResult } from '@nexus/shared';
import { NfeFlowConfig } from '../model';

export class ListFlowConfigs
  implements UseCase<NfeFlowConfigPageParams, PageResult<NfeFlowConfig>>
{
  constructor(private readonly repository: NfeFlowConfigRepository) {}

  execute(input: NfeFlowConfigPageParams) {
    return this.repository.findPage(input);
  }
}
