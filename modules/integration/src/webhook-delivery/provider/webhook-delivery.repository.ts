import { PageResult } from '@nexus/shared';
import { WebhookDelivery } from '../model';

export interface WebhookDeliveryPageParams {
  webhookEndpointId: string;
  page: number;
  perPage: number;
}

export interface WebhookDeliveryRepository {
  create(data: WebhookDelivery): Promise<WebhookDelivery>;
  update(data: WebhookDelivery): Promise<WebhookDelivery>;
  findById(id: string): Promise<WebhookDelivery | null>;
  findByIdempotencyKey(key: string): Promise<WebhookDelivery | null>;
  findPage(
    params: WebhookDeliveryPageParams,
  ): Promise<PageResult<WebhookDelivery>>;
  findDueRetries(limit: number, referenceDate: Date): Promise<WebhookDelivery[]>;
}
