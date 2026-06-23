import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  Validator,
  WebhookEventType,
} from '@nexus/shared';
import {
  WEBHOOK_DELIVERY_STATUSES,
  WebhookDeliveryStatus,
} from './webhook-delivery-status';

export interface WebhookDeliveryState extends EntityState {
  webhookEndpointId: string;
  organizationId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextRetryAt?: Date | null;
  lastError?: string | null;
  deliveredAt?: Date | null;
  idempotencyKey: string;
}

export class WebhookDelivery extends Entity<WebhookDeliveryState> {
  constructor(props: WebhookDeliveryState) {
    super(props);
  }

  get webhookEndpointId(): string {
    return this.props.webhookEndpointId;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get eventType(): WebhookEventType {
    return this.props.eventType;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get status(): WebhookDeliveryStatus {
    return this.props.status;
  }

  get attempts(): number {
    return this.props.attempts;
  }

  get nextRetryAt(): Date | null | undefined {
    return this.props.nextRetryAt;
  }

  get lastError(): string | null | undefined {
    return this.props.lastError;
  }

  get deliveredAt(): Date | null | undefined {
    return this.props.deliveredAt;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  markDelivered(deliveredAt: Date = new Date()): WebhookDelivery {
    return new WebhookDelivery({
      ...this.props,
      status: 'delivered',
      deliveredAt,
      nextRetryAt: null,
      lastError: null,
      updatedAt: new Date(),
    });
  }

  markFailed(error: string, nextRetryAt?: Date | null): WebhookDelivery {
    return new WebhookDelivery({
      ...this.props,
      status: nextRetryAt ? 'pending' : 'failed',
      attempts: this.attempts + 1,
      lastError: error,
      nextRetryAt: nextRetryAt ?? null,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'webhookDelivery.webhookEndpointId',
        value: this.webhookEndpointId,
        rules: [new RequiredRule()],
      },
      {
        code: 'webhookDelivery.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'webhookDelivery.eventType',
        value: this.eventType,
        rules: [new RequiredRule()],
      },
      {
        code: 'webhookDelivery.status',
        value: this.status,
        rules: [new RequiredRule(), new InRule([...WEBHOOK_DELIVERY_STATUSES])],
      },
      {
        code: 'webhookDelivery.idempotencyKey',
        value: this.idempotencyKey,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
