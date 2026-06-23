import { UseCase, PageResult } from '@nexus/shared';
import { WebhookDelivery } from '../model';
import { WebhookDeliveryRepository } from '../provider';

export interface CreateWebhookDeliveryIn {
  webhookEndpointId: string;
  organizationId: string;
  eventType: WebhookDelivery['eventType'];
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export class CreateWebhookDelivery
  implements UseCase<CreateWebhookDeliveryIn, WebhookDelivery>
{
  constructor(
    private readonly webhookDeliveryRepository: WebhookDeliveryRepository,
  ) {}

  async execute(input: CreateWebhookDeliveryIn): Promise<WebhookDelivery> {
    const existing = await this.webhookDeliveryRepository.findByIdempotencyKey(
      input.idempotencyKey,
    );

    if (existing) {
      return existing;
    }

    const delivery = new WebhookDelivery({
      webhookEndpointId: input.webhookEndpointId,
      organizationId: input.organizationId,
      eventType: input.eventType,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      idempotencyKey: input.idempotencyKey,
    });

    delivery.validate();
    return this.webhookDeliveryRepository.create(delivery);
  }
}

export interface UpdateWebhookDeliveryIn {
  delivery: WebhookDelivery;
}

export class UpdateWebhookDelivery
  implements UseCase<UpdateWebhookDeliveryIn, WebhookDelivery>
{
  constructor(
    private readonly webhookDeliveryRepository: WebhookDeliveryRepository,
  ) {}

  execute(input: UpdateWebhookDeliveryIn) {
    return this.webhookDeliveryRepository.update(input.delivery);
  }
}

export interface FindWebhookDeliveryPageIn {
  webhookEndpointId: string;
  page: number;
  perPage: number;
}

export class FindWebhookDeliveryPage
  implements
    UseCase<FindWebhookDeliveryPageIn, PageResult<WebhookDelivery>>
{
  constructor(
    private readonly webhookDeliveryRepository: WebhookDeliveryRepository,
  ) {}

  execute(input: FindWebhookDeliveryPageIn) {
    return this.webhookDeliveryRepository.findPage(input);
  }
}
