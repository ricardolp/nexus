import { queryOptions } from '@tanstack/react-query';
import {
  getIntegrationTokens,
  getOrganizationIntegrationSettings,
  getWebhookDeliveries,
  getWebhooks,
} from './service';
import type { IntegrationListFilters } from './types';

export const integrationKeys = {
  all: ['integration'] as const,
  tokens: (organizationId: string, filters: IntegrationListFilters) =>
    [...integrationKeys.all, 'tokens', organizationId, filters] as const,
  webhooks: (organizationId: string, filters: IntegrationListFilters) =>
    [...integrationKeys.all, 'webhooks', organizationId, filters] as const,
  deliveries: (organizationId: string, endpointId: string, page: number) =>
    [...integrationKeys.all, 'deliveries', organizationId, endpointId, page] as const,
  settings: (organizationId: string) =>
    [...integrationKeys.all, 'settings', organizationId] as const,
};

export const integrationTokensQueryOptions = (
  organizationId: string,
  filters: IntegrationListFilters,
) =>
  queryOptions({
    queryKey: integrationKeys.tokens(organizationId, filters),
    queryFn: () => getIntegrationTokens(organizationId, filters),
  });

export const webhooksQueryOptions = (
  organizationId: string,
  filters: IntegrationListFilters,
) =>
  queryOptions({
    queryKey: integrationKeys.webhooks(organizationId, filters),
    queryFn: () => getWebhooks(organizationId, filters),
  });

export const webhookDeliveriesQueryOptions = (
  organizationId: string,
  endpointId: string,
  page: number,
) =>
  queryOptions({
    queryKey: integrationKeys.deliveries(organizationId, endpointId, page),
    queryFn: () => getWebhookDeliveries(organizationId, endpointId, page),
  });

export const organizationIntegrationSettingsQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: integrationKeys.settings(organizationId),
    queryFn: () => getOrganizationIntegrationSettings(organizationId),
  });
