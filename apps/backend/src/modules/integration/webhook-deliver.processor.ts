import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UpdateWebhookDelivery } from '@nexus/integration';
import { WebhookPayload } from '@nexus/shared';
import { PrismaWebhookDeliveryRepository } from './webhook-delivery.prisma';
import { PrismaWebhookEndpointRepository } from './webhook-endpoint.prisma';
import { FetchWebhookHttpClient } from './fetch-webhook-http-client';
import {
  buildWebhookBody,
  getNextRetryDate,
  signWebhookPayload,
} from './webhook-signature.util';
import { WEBHOOK_DELIVER_QUEUE } from './domain-event-publisher.service';

@Injectable()
@Processor(WEBHOOK_DELIVER_QUEUE)
export class WebhookDeliverProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliverProcessor.name);
  private readonly updateDelivery: UpdateWebhookDelivery;

  constructor(
    private readonly webhookDeliveryRepository: PrismaWebhookDeliveryRepository,
    private readonly webhookEndpointRepository: PrismaWebhookEndpointRepository,
    private readonly httpClient: FetchWebhookHttpClient,
  ) {
    super();
    this.updateDelivery = new UpdateWebhookDelivery(webhookDeliveryRepository);
  }

  async process(job: Job<{ deliveryId: string }>): Promise<void> {
    const delivery = await this.webhookDeliveryRepository.findById(
      job.data.deliveryId,
    );

    if (!delivery || delivery.status === 'delivered') {
      return;
    }

    const endpoint = await this.webhookEndpointRepository.findById(
      delivery.webhookEndpointId,
    );

    if (!endpoint || !endpoint.active) {
      return;
    }

    const payload = delivery.payload as unknown as WebhookPayload;
    const body = buildWebhookBody(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(endpoint.secret, timestamp, body);

    try {
      const response = await this.httpClient.post({
        url: endpoint.url,
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Nexus-Event': delivery.eventType,
          'X-Nexus-Delivery-Id': delivery.id,
          'X-Nexus-Timestamp': String(timestamp),
          'X-Nexus-Signature': `sha256=${signature}`,
        },
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status}: ${response.body.slice(0, 200)}`);
      }

      await this.updateDelivery.execute({
        delivery: delivery.markDelivered(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao entregar webhook';
      const nextRetryAt = getNextRetryDate(delivery.attempts);

      await this.updateDelivery.execute({
        delivery: delivery.markFailed(message, nextRetryAt),
      });

      this.logger.warn(
        `Webhook delivery ${delivery.id} failed (attempt ${delivery.attempts + 1}): ${message}`,
      );
    }
  }
}
