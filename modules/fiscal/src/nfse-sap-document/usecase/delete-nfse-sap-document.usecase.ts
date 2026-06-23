import { UseCase } from '@nexus/shared';
import { NfseSapDocument } from '../model';
import { NfseSapDocumentRepository } from '../provider';

export class DeleteNfseSapDocument implements UseCase<NfseSapDocument, NfseSapDocument> {
  constructor(private readonly repository: NfseSapDocumentRepository) {}

  async execute(input: NfseSapDocument): Promise<NfseSapDocument> {
    input.validate();
    return this.repository.create(input);
  }
}
