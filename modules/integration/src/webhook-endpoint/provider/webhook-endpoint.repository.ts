import { PageResult } from '@nexus/shared';
import { WebhookEndpoint } from '../model';

export interface WebhookEndpointPageParams {
  organizationId: string;
  page: number;
  perPage: number;
}

export interface WebhookEndpointRepository {
  create(data: WebhookEndpoint): Promise<WebhookEndpoint>;
  update(data: WebhookEndpoint): Promise<WebhookEndpoint>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<WebhookEndpoint | null>;
  findPage(
    params: WebhookEndpointPageParams,
  ): Promise<PageResult<WebhookEndpoint>>;
  findActiveByOrganizationAndEventType(
    organizationId: string,
    eventType: string,
  ): Promise<WebhookEndpoint[]>;
}
