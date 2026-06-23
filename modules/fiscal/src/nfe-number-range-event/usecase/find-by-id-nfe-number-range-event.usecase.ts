import { UseCase } from '@nexus/shared';
import { NfeNumberRangeEvent } from '../model';
import { NfeNumberRangeEventRepository } from '../provider';

export class FindByIdNfeNumberRangeEvent implements UseCase<NfeNumberRangeEvent, NfeNumberRangeEvent> {
  constructor(private readonly repository: NfeNumberRangeEventRepository) {}

  async execute(input: NfeNumberRangeEvent): Promise<NfeNumberRangeEvent> {
    input.validate();
    return this.repository.create(input);
  }
}
