import { mutationOptions } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import {
  createOrganization,
  createOrganizationUser,
  updateOrganizationSettings,
} from './service';
import { organizationKeys } from './queries';
import type {
  CreateOrganizationPayload,
  CreateOrganizationUserPayload,
  UpdateOrganizationSettingsPayload,
} from './types';

export const createOrganizationMutation = mutationOptions({
  mutationFn: (payload: CreateOrganizationPayload) => createOrganization(payload),
  onSuccess: () => {
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
