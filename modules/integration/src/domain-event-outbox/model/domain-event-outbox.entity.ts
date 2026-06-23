import {
  Entity,
  EntityState,
  RequiredRule,
  Validator,
  WebhookEventType,
} from '@nexus/shared';

export interface DomainEventOutboxState extends EntityState {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  publishedAt?: Date | null;
}

export class DomainEventOutbox extends Entity<DomainEventOutboxState> {
  constructor(props: DomainEventOutboxState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get aggregateType(): string {
    return this.props.aggregateType;
  }

  get aggregateId(): string {
    return this.props.aggregateId;
  }

  get eventType(): WebhookEventType {
    return this.props.eventType;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get publishedAt(): Date | null | undefined {
    return this.props.publishedAt;
  }

  markPublished(publishedAt: Date = new Date()): DomainEventOutbox {
    return new DomainEventOutbox({
      ...this.props,
      publishedAt,
      updatedAt: new Date(),
    });
  }

  validate(): void {
    Validator.validate([
      {
        code: 'domainEventOutbox.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'domainEventOutbox.aggregateType',
        value: this.aggregateType,
        rules: [new RequiredRule()],
      },
      {
        code: 'domainEventOutbox.aggregateId',
        value: this.aggregateId,
        rules: [new RequiredRule()],
      },
      {
        code: 'domainEventOutbox.eventType',
        value: this.eventType,
        rules: [new RequiredRule()],
      },
    ]);
  }
}
