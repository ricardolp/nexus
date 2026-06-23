import {
  Entity,
  EntityState,
  InRule,
  RequiredRule,
  UrlRule,
  ValidationError,
  Validator,
  WEBHOOK_EVENT_TYPES,
} from '@nexus/shared';

export interface WebhookEndpointState extends EntityState {
  organizationId: string;
  url: string;
  description?: string | null;
  secret: string;
  eventTypes: string[];
  active: boolean;
  createdByUserId: string;
}

export class WebhookEndpoint extends Entity<WebhookEndpointState> {
  constructor(props: WebhookEndpointState) {
    super(props);
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get url(): string {
    return this.props.url;
  }

  get description(): string | null | undefined {
    return this.props.description;
  }

  get secret(): string {
    return this.props.secret;
  }

  get eventTypes(): string[] {
    return this.props.eventTypes;
  }

  get active(): boolean {
    return this.props.active;
  }

  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  subscribesTo(eventType: string): boolean {
    return this.active && this.eventTypes.includes(eventType);
  }

  validate(): void {
    Validator.validate([
      {
        code: 'webhookEndpoint.organizationId',
        value: this.organizationId,
        rules: [new RequiredRule()],
      },
      {
        code: 'webhookEndpoint.url',
        value: this.url,
        rules: [new RequiredRule(), new UrlRule()],
      },
      {
        code: 'webhookEndpoint.secret',
        value: this.secret,
        rules: [new RequiredRule()],
      },
      {
        code: 'webhookEndpoint.eventTypes',
        value: this.eventTypes,
        rules: [new RequiredRule()],
      },
      ...this.eventTypes.map((eventType, index) => ({
        code: `webhookEndpoint.eventTypes.${index}`,
        value: eventType,
        rules: [new InRule([...WEBHOOK_EVENT_TYPES])],
      })),
    ]);

    if (!this.url.startsWith('https://')) {
      throw new ValidationError('URL do webhook deve usar HTTPS');
    }
  }
}
