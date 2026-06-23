import { Injectable } from '@nestjs/common';
import {
  CreateIntegrationToken,
  CreateWebhookEndpoint,
  DeleteWebhookEndpoint,
  FindIntegrationTokenPage,
  FindWebhookDeliveryPage,
  FindWebhookEndpointById,
  FindWebhookEndpointPage,
  RevokeIntegrationToken,
  UpdateWebhookEndpoint,
} from '@nexus/integration';
import { IntegrationApiScope, WEBHOOK_EVENT_TYPES } from '@nexus/shared';
import { PrismaIntegrationTokenRepository } from './integration-token.prisma';
import { PrismaWebhookEndpointRepository } from './webhook-endpoint.prisma';
import { PrismaWebhookDeliveryRepository } from './webhook-delivery.prisma';

function serializeToken(token: {
  id: string;
  organizationId: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: token.id,
    organizationId: token.organizationId,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    createdByUserId: token.createdByUserId,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    expiresAt: token.expiresAt,
    createdAt: token.createdAt,
  };
}

function serializeWebhookEndpoint(endpoint: {
  id: string;
  organizationId: string;
  url: string;
  description?: string | null;
  eventTypes: string[];
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: endpoint.id,
    organizationId: endpoint.organizationId,
    url: endpoint.url,
    description: endpoint.description,
    eventTypes: endpoint.eventTypes,
    active: endpoint.active,
    createdAt: endpoint.createdAt,
  };
}

@Injectable()
export class IntegrationFacadeService {
  private readonly createIntegrationToken: CreateIntegrationToken;
  private readonly findIntegrationTokenPage: FindIntegrationTokenPage;
  private readonly revokeIntegrationToken: RevokeIntegrationToken;
  private readonly createWebhookEndpoint: CreateWebhookEndpoint;
  private readonly updateWebhookEndpoint: UpdateWebhookEndpoint;
  private readonly deleteWebhookEndpoint: DeleteWebhookEndpoint;
  private readonly findWebhookEndpointPage: FindWebhookEndpointPage;
  private readonly findWebhookEndpointById: FindWebhookEndpointById;
  private readonly findWebhookDeliveryPage: FindWebhookDeliveryPage;

  constructor(
    integrationTokenRepository: PrismaIntegrationTokenRepository,
    webhookEndpointRepository: PrismaWebhookEndpointRepository,
    webhookDeliveryRepository: PrismaWebhookDeliveryRepository,
  ) {
    this.createIntegrationToken = new CreateIntegrationToken(
      integrationTokenRepository,
    );
    this.findIntegrationTokenPage = new FindIntegrationTokenPage(
      integrationTokenRepository,
    );
    this.revokeIntegrationToken = new RevokeIntegrationToken(
      integrationTokenRepository,
    );
    this.createWebhookEndpoint = new CreateWebhookEndpoint(
      webhookEndpointRepository,
    );
    this.updateWebhookEndpoint = new UpdateWebhookEndpoint(
      webhookEndpointRepository,
    );
    this.deleteWebhookEndpoint = new DeleteWebhookEndpoint(
      webhookEndpointRepository,
    );
    this.findWebhookEndpointPage = new FindWebhookEndpointPage(
      webhookEndpointRepository,
    );
    this.findWebhookEndpointById = new FindWebhookEndpointById(
      webhookEndpointRepository,
    );
    this.findWebhookDeliveryPage = new FindWebhookDeliveryPage(
      webhookDeliveryRepository,
    );
  }

  listEventTypes() {
    return WEBHOOK_EVENT_TYPES;
  }

  async createToken(
    organizationId: string,
    createdByUserId: string,
    name: string,
    scopes: IntegrationApiScope[],
    expiresAt?: string | null,
  ) {
    const result = await this.createIntegrationToken.execute({
      organizationId,
      name,
      scopes,
      createdByUserId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    return {
      ...serializeToken(result.token),
      secret: result.secret,
    };
  }

  async listTokens(organizationId: string, page: number, perPage: number) {
    const result = await this.findIntegrationTokenPage.execute({
      organizationId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeToken),
    };
  }

  async revokeToken(organizationId: string, tokenId: string) {
    const token = await this.revokeIntegrationToken.execute({
      organizationId,
      tokenId,
    });
    return serializeToken(token);
  }

  async createWebhook(
    organizationId: string,
    createdByUserId: string,
    url: string,
    eventTypes: string[],
    description?: string | null,
  ) {
    const endpoint = await this.createWebhookEndpoint.execute({
      organizationId,
      url,
      eventTypes,
      description,
      createdByUserId,
    });

    return {
      ...serializeWebhookEndpoint(endpoint),
      secret: endpoint.secret,
    };
  }

  async listWebhooks(organizationId: string, page: number, perPage: number) {
    const result = await this.findWebhookEndpointPage.execute({
      organizationId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeWebhookEndpoint),
    };
  }

  async updateWebhook(
    organizationId: string,
    endpointId: string,
    input: {
      url?: string;
      description?: string | null;
      eventTypes?: string[];
      active?: boolean;
    },
  ) {
    const endpoint = await this.updateWebhookEndpoint.execute({
      organizationId,
      endpointId,
      ...input,
    });
    return serializeWebhookEndpoint(endpoint);
  }

  async deleteWebhook(organizationId: string, endpointId: string) {
    await this.deleteWebhookEndpoint.execute({ organizationId, endpointId });
  }

  async listWebhookDeliveries(
    organizationId: string,
    endpointId: string,
    page: number,
    perPage: number,
  ) {
    await this.findWebhookEndpointById.execute({ organizationId, endpointId });

    const result = await this.findWebhookDeliveryPage.execute({
      webhookEndpointId: endpointId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map((delivery) => ({
        id: delivery.id,
        eventType: delivery.eventType,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.lastError,
        deliveredAt: delivery.deliveredAt,
        createdAt: delivery.createdAt,
      })),
    };
  }
}
