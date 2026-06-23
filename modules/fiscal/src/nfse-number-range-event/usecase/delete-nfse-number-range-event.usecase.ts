import { UseCase } from '@nexus/shared';
import { NfseNumberRangeEvent } from '../model';
import { NfseNumberRangeEventRepository } from '../provider';

export class DeleteNfseNumberRangeEvent implements UseCase<NfseNumberRangeEvent, NfseNumberRangeEvent> {
  constructor(private readonly repository: NfseNumberRangeEventRepository) {}

  async execute(input: NfseNumberRangeEvent): Promise<NfseNumberRangeEvent> {
    input.validate();
    return this.repository.create(input);
  }
}
