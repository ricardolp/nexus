import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  CreateWebhookDelivery,
  FindUnpublishedDomainEvents,
  MarkDomainEventPublished,
} from '@nexus/integration';
import { WebhookPayload } from '@nexus/shared';
import { PrismaDomainEventOutboxRepository } from './domain-event-outbox.prisma';
import { PrismaWebhookEndpointRepository } from './webhook-endpoint.prisma';
import { PrismaWebhookDeliveryRepository } from './webhook-delivery.prisma';
import {
  WEBHOOK_DELIVER_QUEUE,
  WEBHOOK_DISPATCH_QUEUE,
} from './domain-event-publisher.service';

@Injectable()
@Processor(WEBHOOK_DISPATCH_QUEUE)
export class WebhookDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDispatchProcessor.name);
  private readonly findUnpublished: FindUnpublishedDomainEvents;
  private readonly markPublished: MarkDomainEventPublished;
  private readonly createDelivery: CreateWebhookDelivery;

  constructor(
    outboxRepository: PrismaDomainEventOutboxRepository,
    webhookEndpointRepository: PrismaWebhookEndpointRepository,
    webhookDeliveryRepository: PrismaWebhookDeliveryRepository,
    @InjectQueue(WEBHOOK_DELIVER_QUEUE) private readonly deliverQueue: Queue,
  ) {
    super();
    this.findUnpublished = new FindUnpublishedDomainEvents(outboxRepository);
    this.markPublished = new MarkDomainEventPublished(outboxRepository);
    this.createDelivery = new CreateWebhookDelivery(webhookDeliveryRepository);
    this.webhookEndpointRepository = webhookEndpointRepository;
  }

  private readonly webhookEndpointRepository: PrismaWebhookEndpointRepository;

  async process(job: Job<{ outboxEventId: string }>): Promise<void> {
    const events = await this.findUnpublished.execute({ limit: 100 });
    const event =
      events.find((item) => item.id === job.data.outboxEventId) ?? events[0];

    if (!event) {
      return;
    }

    const endpoints =
      await this.webhookEndpointRepository.findActiveByOrganizationAndEventType(
        event.organizationId,
        event.eventType,
      );

    const payload: WebhookPayload = {
      id: event.id,
      type: event.eventType,
      createdAt: event.createdAt.toISOString(),
      organizationId: event.organizationId,
      data: event.payload,
    };

    for (const endpoint of endpoints) {
      const delivery = await this.createDelivery.execute({
        webhookEndpointId: endpoint.id,
        organizationId: event.organizationId,
        eventType: event.eventType,
        payload: payload as unknown as Record<string, unknown>,
        idempotencyKey: `${event.id}:${endpoint.id}`,
      });

      await this.deliverQueue.add('deliver', { deliveryId: delivery.id });
    }

    await this.markPublished.execute({ event });
    this.logger.log(`Dispatched webhooks for event ${event.id}`);
  }
}
