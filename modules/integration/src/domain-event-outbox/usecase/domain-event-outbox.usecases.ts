import { PageResult, UseCase } from '@nexus/shared';
import { DomainEventOutbox } from '../model';
import {
  DomainEventOutboxRepository,
  PublishDomainEventInput,
} from '../provider';

export class PublishDomainEvent
  implements UseCase<PublishDomainEventInput, DomainEventOutbox>
{
  constructor(
    private readonly domainEventOutboxRepository: DomainEventOutboxRepository,
  ) {}

  async execute(input: PublishDomainEventInput): Promise<DomainEventOutbox> {
    const event = new DomainEventOutbox({
      organizationId: input.organizationId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
    });

    event.validate();
    return this.domainEventOutboxRepository.create(event);
  }
}

export interface FindUnpublishedDomainEventsIn {
  limit: number;
}

export class FindUnpublishedDomainEvents
  implements
    UseCase<FindUnpublishedDomainEventsIn, DomainEventOutbox[]>
{
  constructor(
    private readonly domainEventOutboxRepository: DomainEventOutboxRepository,
  ) {}

  execute(input: FindUnpublishedDomainEventsIn) {
    return this.domainEventOutboxRepository.findUnpublished(input.limit);
  }
}

export interface MarkDomainEventPublishedIn {
  event: DomainEventOutbox;
}

export class MarkDomainEventPublished
  implements UseCase<MarkDomainEventPublishedIn, DomainEventOutbox>
{
  constructor(
    private readonly domainEventOutboxRepository: DomainEventOutboxRepository,
  ) {}

  async execute(input: MarkDomainEventPublishedIn): Promise<DomainEventOutbox> {
    const published = input.event.markPublished();
    return this.domainEventOutboxRepository.update(published);
  }
}
