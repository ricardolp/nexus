import type { integrationOperationEnum, integrationProviderEnum } from "../../db/schema.js";

export type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number];
export type IntegrationOperation = (typeof integrationOperationEnum.enumValues)[number];

export const INTEGRATION_LOG_MAX_BODY_BYTES = 64 * 1024;

export type RecordIntegrationRequestInput = {
  organizationId: string;
  nfeDocumentId?: string;
  provider: IntegrationProvider;
  operation: IntegrationOperation;
  httpMethod: string;
  requestUrl: string;
  requestBody?: unknown;
  responseBody?: unknown;
  responseStatus?: number | null;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  correlationId?: string;
};

export type ListIntegrationRequestLogsFilters = {
  page?: number;
  limit?: number;
  operation?: IntegrationOperation;
  success?: boolean;
  nfeDocumentId?: string;
  from?: Date;
  to?: Date;
};

export type IntegrationRequestLogSummary = {
  id: string;
  organizationId: string;
  nfeDocumentId: string | null;
  provider: IntegrationProvider;
  operation: IntegrationOperation;
  httpMethod: string;
  requestUrl: string;
  responseStatus: number | null;
  durationMs: number;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  correlationId: string | null;
  createdAt: Date;
};

export type IntegrationRequestLogDetail = IntegrationRequestLogSummary & {
  requestBody: unknown;
  responseBody: unknown;
};
