import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DomainEventPublisherProvider,
  PublishDomainEventInput,
  PublishDomainEvent,
} from '@nexus/integration';
import { PrismaDomainEventOutboxRepository } from './domain-event-outbox.prisma';

export const WEBHOOK_DISPATCH_QUEUE = 'webhook-dispatch';
export const WEBHOOK_DELIVER_QUEUE = 'webhook-deliver';

@Injectable()
export class DomainEventPublisherService implements DomainEventPublisherProvider {
  private readonly publishDomainEvent: PublishDomainEvent;

  constructor(
    outboxRepository: PrismaDomainEventOutboxRepository,
    @InjectQueue(WEBHOOK_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {
    this.publishDomainEvent = new PublishDomainEvent(outboxRepository);
  }

  async publish(input: PublishDomainEventInput): Promise<void> {
    const event = await this.publishDomainEvent.execute(input);
    await this.dispatchQueue.add('dispatch', { outboxEventId: event.id });
  }
}
