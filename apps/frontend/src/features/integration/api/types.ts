export interface IntegrationListFilters {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface IntegrationToken {
  id: string;
  organizationId: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreateIntegrationTokenPayload {
  name: string;
  scopes: string[];
  expiresAt?: string | null;
}

export interface CreateIntegrationTokenResponse extends IntegrationToken {
  secret: string;
}

export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  active: boolean;
  createdAt: string;
}

export interface CreateWebhookPayload {
  url: string;
  description?: string | null;
  eventTypes: string[];
}

export interface UpdateWebhookPayload {
  url?: string;
  description?: string | null;
  eventTypes?: string[];
  active?: boolean;
}

export interface CreateWebhookResponse extends WebhookEndpoint {
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  eventType: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

export interface OrganizationIntegrationSettings {
  baseUrl: string | null;
  clientId: string | null;
  secretConfigured: boolean;
  sapClient: string | null;
  sapLanguage: string | null;
}

export interface UpdateSapIntegrationPayload {
  integrationBaseUrl?: string | null;
  integrationClientId?: string | null;
  clientSecret?: string;
  sapClient?: string | null;
  sapLanguage?: string | null;
}
