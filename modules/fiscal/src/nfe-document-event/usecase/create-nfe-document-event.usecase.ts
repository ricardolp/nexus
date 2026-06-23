import { UseCase } from '@nexus/shared';
import { FiscalNfeEventType } from '../../shared/fiscal-nfe-event-type';
import { NfeDocumentEvent } from '../model';
import { NfeDocumentEventRepository } from '../provider';

export interface CreateNfeDocumentEventIn {
  organizationId: string;
  documentId: string;
  eventType: FiscalNfeEventType;
  sequence: number;
}

export class CreateNfeDocumentEvent
  implements UseCase<CreateNfeDocumentEventIn, NfeDocumentEvent>
{
  constructor(
    private readonly nfeDocumentEventRepository: NfeDocumentEventRepository,
  ) {}

  async execute(input: CreateNfeDocumentEventIn): Promise<NfeDocumentEvent> {
    const event = new NfeDocumentEvent({
      organizationId: input.organizationId,
      documentId: input.documentId,
      eventType: input.eventType,
      eventStatus: 'pending',
      sequence: input.sequence,
    });

    event.validate();
    const created = await this.nfeDocumentEventRepository.create(event);
    const accepted = created.withEventStatus('accepted');
    accepted.validate();
    return this.nfeDocumentEventRepository.update(accepted);
  }
}
