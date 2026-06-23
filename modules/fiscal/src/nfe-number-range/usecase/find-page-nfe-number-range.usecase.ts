import { UseCase } from '@nexus/shared';
import { NfeNumberRange } from '../model';
import { NfeNumberRangeRepository } from '../provider';

export class FindPageNfeNumberRange implements UseCase<NfeNumberRange, NfeNumberRange> {
  constructor(private readonly repository: NfeNumberRangeRepository) {}

  async execute(input: NfeNumberRange): Promise<NfeNumberRange> {
    input.validate();
    return this.repository.create(input);
  }
}
