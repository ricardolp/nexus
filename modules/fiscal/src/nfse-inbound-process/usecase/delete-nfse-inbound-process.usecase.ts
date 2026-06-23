import { UseCase } from '@nexus/shared';
import { NfseInboundProcess } from '../model';
import { NfseInboundProcessRepository } from '../provider';

export class DeleteNfseInboundProcess implements UseCase<NfseInboundProcess, NfseInboundProcess> {
  constructor(private readonly repository: NfseInboundProcessRepository) {}

  async execute(input: NfseInboundProcess): Promise<NfseInboundProcess> {
    input.validate();
    return this.repository.create(input);
  }
}
