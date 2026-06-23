import { UseCase } from '@nexus/shared';
import { NfeSapDocument } from '../model';
import { NfeSapDocumentRepository } from '../provider';

export class UpdateNfeSapDocument implements UseCase<NfeSapDocument, NfeSapDocument> {
  constructor(private readonly repository: NfeSapDocumentRepository) {}

  async execute(input: NfeSapDocument): Promise<NfeSapDocument> {
    input.validate();
    return this.repository.create(input);
  }
}
