import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { integrationRequestLogs } from "../../db/schema.js";
import {
  INTEGRATION_LOG_MAX_BODY_BYTES,
  type IntegrationOperation,
  type IntegrationRequestLogDetail,
  type IntegrationRequestLogSummary,
  type ListIntegrationRequestLogsFilters,
  type RecordIntegrationRequestInput,
} from "./integration-log.types.js";

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const SENSITIVE_KEYS = new Set([
  "authorization",
  "clientsecret",
  "client_secret",
  "password",
  "secret",
]);

export function truncateJsonForLog(value: unknown): unknown {
  if (value === undefined) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return { _truncated: true, _preview: String(value).slice(0, 500) };
  }
  if (serialized.length <= INTEGRATION_LOG_MAX_BODY_BYTES) {
    return value;
  }
  return {
    _truncated: true,
    _preview: serialized.slice(0, INTEGRATION_LOG_MAX_BODY_BYTES),
    _originalBytes: serialized.length,
  };
}

export function redactSensitiveFields(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactSensitiveFields(val);
    }
  }
  return out;
}

function prepareBodyForLog(value: unknown): unknown {
  return truncateJsonForLog(redactSensitiveFields(value));
}

type IntegrationLogSummaryRow = Pick<
  typeof integrationRequestLogs.$inferSelect,
  | "id"
  | "organizationId"
  | "nfeDocumentId"
  | "provider"
  | "operation"
  | "httpMethod"
  | "requestUrl"
  | "responseStatus"
  | "durationMs"
  | "success"
  | "errorCode"
  | "errorMessage"
  | "correlationId"
  | "createdAt"
>;

function toSummary(row: IntegrationLogSummaryRow): IntegrationRequestLogSummary {
  return {
    id: row.id,
    organizationId: row.organizationId,
    nfeDocumentId: row.nfeDocumentId,
    provider: row.provider,
    operation: row.operation,
    httpMethod: row.httpMethod,
    requestUrl: row.requestUrl,
    responseStatus: row.responseStatus,
    durationMs: row.durationMs,
    success: row.success,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}

export async function recordIntegrationRequest(
  db: DbConn,
  input: RecordIntegrationRequestInput
): Promise<void> {
  try {
    await db.insert(integrationRequestLogs).values({
      organizationId: input.organizationId,
      nfeDocumentId: input.nfeDocumentId ?? null,
      provider: input.provider,
      operation: input.operation,
      httpMethod: input.httpMethod,
      requestUrl: input.requestUrl,
      requestBody: prepareBodyForLog(input.requestBody) as Record<string, unknown> | null,
      responseBody: prepareBodyForLog(input.responseBody) as Record<string, unknown> | null,
      responseStatus: input.responseStatus ?? null,
      durationMs: input.durationMs,
      success: input.success,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      correlationId: input.correlationId ?? null,
    });
  } catch (err) {
    console.warn("[integration-log] failed to persist request log", err);
  }
}

export async function listIntegrationRequestLogs(
  db: DbConn,
  organizationId: string,
  filters: ListIntegrationRequestLogsFilters = {}
): Promise<{ logs: IntegrationRequestLogSummary[]; total: number; page: number; limit: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
  const offset = (page - 1) * limit;

  const conditions = [eq(integrationRequestLogs.organizationId, organizationId)];
  if (filters.operation) {
    conditions.push(eq(integrationRequestLogs.operation, filters.operation));
  }
  if (filters.success !== undefined) {
    conditions.push(eq(integrationRequestLogs.success, filters.success));
  }
  if (filters.nfeDocumentId) {
    conditions.push(eq(integrationRequestLogs.nfeDocumentId, filters.nfeDocumentId));
  }
  if (filters.from) {
    conditions.push(gte(integrationRequestLogs.createdAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(integrationRequestLogs.createdAt, filters.to));
  }

  const where = and(...conditions);

  const [totalRow] = await db
    .select({ total: count() })
    .from(integrationRequestLogs)
    .where(where);

  const rows = await db
    .select({
      id: integrationRequestLogs.id,
      organizationId: integrationRequestLogs.organizationId,
      nfeDocumentId: integrationRequestLogs.nfeDocumentId,
      provider: integrationRequestLogs.provider,
      operation: integrationRequestLogs.operation,
      httpMethod: integrationRequestLogs.httpMethod,
      requestUrl: integrationRequestLogs.requestUrl,
      responseStatus: integrationRequestLogs.responseStatus,
      durationMs: integrationRequestLogs.durationMs,
      success: integrationRequestLogs.success,
      errorCode: integrationRequestLogs.errorCode,
      errorMessage: integrationRequestLogs.errorMessage,
      correlationId: integrationRequestLogs.correlationId,
      createdAt: integrationRequestLogs.createdAt,
    })
    .from(integrationRequestLogs)
    .where(where)
    .orderBy(desc(integrationRequestLogs.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    logs: rows.map(toSummary),
    total: Number(totalRow?.total ?? 0),
    page,
    limit,
  };
}

export async function getIntegrationRequestLogById(
  db: DbConn,
  organizationId: string,
  logId: string
): Promise<IntegrationRequestLogDetail | null> {
  const [row] = await db
    .select()
    .from(integrationRequestLogs)
    .where(
      and(
        eq(integrationRequestLogs.id, logId),
        eq(integrationRequestLogs.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) return null;

  return {
    ...toSummary(row),
    requestBody: row.requestBody,
    responseBody: row.responseBody,
  };
}

export type { IntegrationOperation };
