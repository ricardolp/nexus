import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { syncOrganizationLogoToCache } from '@/lib/organization/organization-logo-cache';
import {
  createOrganization,
  createOrganizationUser,
  updateOrganization,
  updateOrganizationSettings,
} from './service';
import { organizationKeys } from './queries';
import type {
  CreateOrganizationPayload,
  CreateOrganizationUserPayload,
  UpdateOrganizationPayload,
  UpdateOrganizationSettingsPayload,
} from './types';

export const createOrganizationMutation = mutationOptions({
  mutationFn: (payload: CreateOrganizationPayload) => createOrganization(payload),
  onSuccess: (organization) => {
    syncOrganizationLogoToCache(organization.id, organization.logo ?? null);
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const updateOrganizationMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: UpdateOrganizationPayload;
  }) => updateOrganization(organizationId, payload),
  onSuccess: (organization) => {
    syncOrganizationLogoToCache(organization.id, organization.logo ?? null);
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const createOrganizationUserMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: CreateOrganizationUserPayload;
  }) => createOrganizationUser(organizationId, payload),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: organizationKeys.all });
  },
});

export const updateOrganizationSettingsMutation = mutationOptions({
  mutationFn: ({
    organizationId,
    payload,
  }: {
    organizationId: string;
    payload: UpdateOrganizationSettingsPayload;
  }) => updateOrganizationSettings(organizationId, payload),
  onSuccess: (_data, variables) => {
    getQueryClient().invalidateQueries({
      queryKey: organizationKeys.settings(variables.organizationId),
    });
  },
});
