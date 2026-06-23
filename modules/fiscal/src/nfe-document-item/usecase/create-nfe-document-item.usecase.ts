import { UseCase } from '@nexus/shared';
import { NfeDocumentItem } from '../model';
import { NfeDocumentItemRepository } from '../provider';

export class CreateNfeDocumentItem implements UseCase<NfeDocumentItem, NfeDocumentItem> {
  constructor(private readonly repository: NfeDocumentItemRepository) {}

  async execute(input: NfeDocumentItem): Promise<NfeDocumentItem> {
    input.validate();
    return this.repository.create(input);
  }
}
