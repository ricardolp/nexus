import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '../../db/db.module';
import {
  DomainEventPublisherService,
  WEBHOOK_DELIVER_QUEUE,
  WEBHOOK_DISPATCH_QUEUE,
} from './domain-event-publisher.service';
import { PrismaDomainEventOutboxRepository } from './domain-event-outbox.prisma';
import { PrismaWebhookDeliveryRepository } from './webhook-delivery.prisma';
import { PrismaWebhookEndpointRepository } from './webhook-endpoint.prisma';
import { FetchWebhookHttpClient } from './fetch-webhook-http-client';
import { WebhookDeliverProcessor } from './webhook-deliver.processor';
import { WebhookDispatchProcessor } from './webhook-dispatch.processor';

@Module({
  imports: [
    DbModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: WEBHOOK_DISPATCH_QUEUE },
      { name: WEBHOOK_DELIVER_QUEUE },
    ),
  ],
  providers: [
    PrismaDomainEventOutboxRepository,
    PrismaWebhookEndpointRepository,
    PrismaWebhookDeliveryRepository,
    DomainEventPublisherService,
    FetchWebhookHttpClient,
    WebhookDispatchProcessor,
    WebhookDeliverProcessor,
  ],
  exports: [DomainEventPublisherService],
})
export class EventDispatchModule {}
