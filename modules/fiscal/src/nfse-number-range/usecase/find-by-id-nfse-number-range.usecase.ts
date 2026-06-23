import { UseCase } from '@nexus/shared';
import { NfseNumberRange } from '../model';
import { NfseNumberRangeRepository } from '../provider';

export class FindByIdNfseNumberRange implements UseCase<NfseNumberRange, NfseNumberRange> {
  constructor(private readonly repository: NfseNumberRangeRepository) {}

  async execute(input: NfseNumberRange): Promise<NfseNumberRange> {
    input.validate();
    return this.repository.create(input);
  }
}
