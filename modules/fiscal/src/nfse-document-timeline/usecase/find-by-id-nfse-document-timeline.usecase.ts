import { UseCase } from '@nexus/shared';
import { NfseDocumentTimeline } from '../model';
import { NfseDocumentTimelineRepository } from '../provider';

export class FindByIdNfseDocumentTimeline implements UseCase<NfseDocumentTimeline, NfseDocumentTimeline> {
  constructor(private readonly repository: NfseDocumentTimelineRepository) {}

  async execute(input: NfseDocumentTimeline): Promise<NfseDocumentTimeline> {
    input.validate();
    return this.repository.create(input);
  }
}
