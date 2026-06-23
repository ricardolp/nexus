import { UseCase } from '@nexus/shared';
import { NfseDocumentAttachment } from '../model';
import { NfseDocumentAttachmentRepository } from '../provider';

export class FindByIdNfseDocumentAttachment implements UseCase<NfseDocumentAttachment, NfseDocumentAttachment> {
  constructor(private readonly repository: NfseDocumentAttachmentRepository) {}

  async execute(input: NfseDocumentAttachment): Promise<NfseDocumentAttachment> {
    input.validate();
    return this.repository.create(input);
  }
}
