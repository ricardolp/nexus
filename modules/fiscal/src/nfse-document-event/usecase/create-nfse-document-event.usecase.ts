import { UseCase } from '@nexus/shared';
import { FiscalNfseEventType } from '../../shared/fiscal-nfse-event-type';
import { NfseDocumentEvent } from '../model';
import { NfseDocumentEventRepository } from '../provider';

export interface CreateNfseDocumentEventIn {
  organizationId: string;
  documentId: string;
  eventType: FiscalNfseEventType;
  sequence: number;
}

export class CreateNfseDocumentEvent
  implements UseCase<CreateNfseDocumentEventIn, NfseDocumentEvent>
{
  constructor(
    private readonly nfseDocumentEventRepository: NfseDocumentEventRepository,
  ) {}

  async execute(input: CreateNfseDocumentEventIn): Promise<NfseDocumentEvent> {
    const event = new NfseDocumentEvent({
      organizationId: input.organizationId,
      documentId: input.documentId,
      eventType: input.eventType,
      eventStatus: 'pending',
      sequence: input.sequence,
    });

    event.validate();
    const created = await this.nfseDocumentEventRepository.create(event);
    const accepted = created.withEventStatus('accepted');
    accepted.validate();
    return this.nfseDocumentEventRepository.update(accepted);
  }
}
