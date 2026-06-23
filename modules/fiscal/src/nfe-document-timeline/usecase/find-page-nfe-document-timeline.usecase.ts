import { UseCase } from '@nexus/shared';
import { NfeDocumentTimeline } from '../model';
import { NfeDocumentTimelineRepository } from '../provider';

export class FindPageNfeDocumentTimeline implements UseCase<NfeDocumentTimeline, NfeDocumentTimeline> {
  constructor(private readonly repository: NfeDocumentTimelineRepository) {}

  async execute(input: NfeDocumentTimeline): Promise<NfeDocumentTimeline> {
    input.validate();
    return this.repository.create(input);
  }
}
