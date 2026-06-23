import { queryOptions } from '@tanstack/react-query';
import { getFlowConfig, getFlowConfigHistory, listFlowConfigs } from './service';

export const nfeFlowConfigKeys = {
  all: ['nfe-flow-config'] as const,
  list: (organizationId: string, companyId: string, model: string) =>
    [...nfeFlowConfigKeys.all, 'list', organizationId, companyId, model] as const,
  detail: (organizationId: string, companyId: string, configId: string) =>
    [...nfeFlowConfigKeys.all, 'detail', organizationId, companyId, configId] as const,
  history: (organizationId: string, companyId: string, configId: string) =>
    [...nfeFlowConfigKeys.all, 'history', organizationId, companyId, configId] as const,
};

export const flowConfigListQueryOptions = (
  organizationId: string,
  companyId: string,
  model: string,
) =>
  queryOptions({
    queryKey: nfeFlowConfigKeys.list(organizationId, companyId, model),
    queryFn: () => listFlowConfigs(organizationId, companyId, model),
    enabled: Boolean(organizationId && companyId),
  });

export const flowConfigDetailQueryOptions = (
  organizationId: string,
  companyId: string,
  configId: string | null,
) =>
  queryOptions({
    queryKey: nfeFlowConfigKeys.detail(organizationId, companyId, configId ?? ''),
    queryFn: () => getFlowConfig(organizationId, companyId, configId!),
    enabled: Boolean(organizationId && companyId && configId),
  });

export const flowConfigHistoryQueryOptions = (
  organizationId: string,
  companyId: string,
  configId: string | null,
) =>
  queryOptions({
    queryKey: nfeFlowConfigKeys.history(organizationId, companyId, configId ?? ''),
    queryFn: () => getFlowConfigHistory(organizationId, companyId, configId!),
    enabled: Boolean(organizationId && companyId && configId),
  });
