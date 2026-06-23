import { UseCase } from '@nexus/shared';
import { NfseDocumentItem } from '../model';
import { NfseDocumentItemRepository } from '../provider';

export class FindByIdNfseDocumentItem implements UseCase<NfseDocumentItem, NfseDocumentItem> {
  constructor(private readonly repository: NfseDocumentItemRepository) {}

  async execute(input: NfseDocumentItem): Promise<NfseDocumentItem> {
    input.validate();
    return this.repository.create(input);
  }
}
