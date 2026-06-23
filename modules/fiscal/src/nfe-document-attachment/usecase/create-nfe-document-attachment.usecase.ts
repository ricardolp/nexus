import { UseCase } from '@nexus/shared';
import { NfeDocumentAttachment } from '../model';
import { NfeDocumentAttachmentRepository } from '../provider';

export class CreateNfeDocumentAttachment implements UseCase<NfeDocumentAttachment, NfeDocumentAttachment> {
  constructor(private readonly repository: NfeDocumentAttachmentRepository) {}

  async execute(input: NfeDocumentAttachment): Promise<NfeDocumentAttachment> {
    input.validate();
    return this.repository.create(input);
  }
}
