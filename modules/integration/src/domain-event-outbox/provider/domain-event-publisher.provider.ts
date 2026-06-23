import { WebhookEventType } from '@nexus/shared';

export interface PublishDomainEventInput {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
}

export interface DomainEventPublisherProvider {
  publish(input: PublishDomainEventInput): Promise<void>;
}
