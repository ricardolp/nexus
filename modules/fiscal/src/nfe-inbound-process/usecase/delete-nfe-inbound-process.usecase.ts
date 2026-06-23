import { UseCase } from '@nexus/shared';
import { NfeInboundProcess } from '../model';
import { NfeInboundProcessRepository } from '../provider';

export class DeleteNfeInboundProcess implements UseCase<NfeInboundProcess, NfeInboundProcess> {
  constructor(private readonly repository: NfeInboundProcessRepository) {}

  async execute(input: NfeInboundProcess): Promise<NfeInboundProcess> {
    input.validate();
    return this.repository.create(input);
  }
}
