import { generateRawToken, NotFoundError, PageResult, UseCase } from '@nexus/shared';
import { WebhookEndpoint } from '../model';
import { WebhookEndpointRepository } from '../provider';

export interface CreateWebhookEndpointIn {
  organizationId: string;
  url: string;
  description?: string | null;
  eventTypes: string[];
  createdByUserId: string;
}

export class CreateWebhookEndpoint
  implements UseCase<CreateWebhookEndpointIn, WebhookEndpoint>
{
  constructor(
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  async execute(input: CreateWebhookEndpointIn): Promise<WebhookEndpoint> {
    const endpoint = new WebhookEndpoint({
      organizationId: input.organizationId,
      url: input.url,
      description: input.description ?? null,
      secret: generateRawToken(),
      eventTypes: input.eventTypes,
      active: true,
      createdByUserId: input.createdByUserId,
    });

    endpoint.validate();
    return this.webhookEndpointRepository.create(endpoint);
  }
}

export interface UpdateWebhookEndpointIn {
  organizationId: string;
  endpointId: string;
  url?: string;
  description?: string | null;
  eventTypes?: string[];
  active?: boolean;
}

export class UpdateWebhookEndpoint
  implements UseCase<UpdateWebhookEndpointIn, WebhookEndpoint>
{
  constructor(
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  async execute(input: UpdateWebhookEndpointIn): Promise<WebhookEndpoint> {
    const existing = await this.webhookEndpointRepository.findById(
      input.endpointId,
    );

    if (!existing || existing.organizationId !== input.organizationId) {
      throw new NotFoundError('Endpoint de webhook não encontrado');
    }

    const updated = existing.clone({
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.eventTypes !== undefined
        ? { eventTypes: input.eventTypes }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });

    updated.validate();
    return this.webhookEndpointRepository.update(updated);
  }
}

export interface DeleteWebhookEndpointIn {
  organizationId: string;
  endpointId: string;
}

export class DeleteWebhookEndpoint
  implements UseCase<DeleteWebhookEndpointIn, void>
{
  constructor(
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  async execute(input: DeleteWebhookEndpointIn): Promise<void> {
    const existing = await this.webhookEndpointRepository.findById(
      input.endpointId,
    );

    if (!existing || existing.organizationId !== input.organizationId) {
      throw new NotFoundError('Endpoint de webhook não encontrado');
    }

    await this.webhookEndpointRepository.delete(input.endpointId);
  }
}

export interface FindWebhookEndpointPageIn {
  organizationId: string;
  page: number;
  perPage: number;
}

export class FindWebhookEndpointPage
  implements
    UseCase<
      FindWebhookEndpointPageIn,
      PageResult<WebhookEndpoint>
    >
{
  constructor(
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  execute(input: FindWebhookEndpointPageIn) {
    return this.webhookEndpointRepository.findPage(input);
  }
}

export interface FindWebhookEndpointByIdIn {
  organizationId: string;
  endpointId: string;
}

export class FindWebhookEndpointById
  implements UseCase<FindWebhookEndpointByIdIn, WebhookEndpoint>
{
  constructor(
    private readonly webhookEndpointRepository: WebhookEndpointRepository,
  ) {}

  async execute(input: FindWebhookEndpointByIdIn): Promise<WebhookEndpoint> {
    const endpoint = await this.webhookEndpointRepository.findById(
      input.endpointId,
    );

    if (!endpoint || endpoint.organizationId !== input.organizationId) {
      throw new NotFoundError('Endpoint de webhook não encontrado');
    }

    return endpoint;
  }
}
