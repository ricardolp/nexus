import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import {
  createIntegrationToken,
  createWebhook,
  deleteWebhook,
  revokeIntegrationToken,
  updateSapIntegrationSettings,
  updateWebhook,
} from './service';
import { integrationKeys } from './queries';

export const createIntegrationTokenMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: Parameters<typeof createIntegrationToken>[1];
  }) => createIntegrationToken(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});

export const revokeIntegrationTokenMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    tokenId,
  }: {
    organizationId: string;
    tokenId: string;
  }) => revokeIntegrationToken(organizationId, tokenId),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});

export const createWebhookMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: Parameters<typeof createWebhook>[1];
  }) => createWebhook(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});

export const updateWebhookMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    endpointId,
    payload,
  }: {
    organizationId: string;
    endpointId: string;
    payload: Parameters<typeof updateWebhook>[2];
  }) => updateWebhook(organizationId, endpointId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});

export const deleteWebhookMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    endpointId,
  }: {
    organizationId: string;
    endpointId: string;
  }) => deleteWebhook(organizationId, endpointId),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});

export const updateSapIntegrationMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: Parameters<typeof updateSapIntegrationSettings>[1];
  }) => updateSapIntegrationSettings(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: integrationKeys.all });
  },
});
