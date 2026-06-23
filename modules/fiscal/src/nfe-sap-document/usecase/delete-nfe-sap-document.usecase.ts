import { UseCase } from '@nexus/shared';
import { NfeSapDocument } from '../model';
import { NfeSapDocumentRepository } from '../provider';

export class DeleteNfeSapDocument implements UseCase<NfeSapDocument, NfeSapDocument> {
  constructor(private readonly repository: NfeSapDocumentRepository) {}

  async execute(input: NfeSapDocument): Promise<NfeSapDocument> {
    input.validate();
    return this.repository.create(input);
  }
}
