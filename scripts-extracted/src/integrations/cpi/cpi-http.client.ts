import { AppError } from "../../common/http/errors.js";
import type { Db } from "../../db/client.js";
import { recordIntegrationRequest } from "../../modules/integrations/integration-log.service.js";
import type { IntegrationOperation } from "../../modules/integrations/integration-log.types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type CpiIntegrationLogContext = {
  db: DbConn;
  organizationId: string;
  operation: IntegrationOperation;
  nfeDocumentId?: string;
  correlationId?: string;
};

async function persistCpiRequestLog(
  logContext: CpiIntegrationLogContext,
  input: {
    method: string;
    url: string;
    requestBody?: unknown;
    responseBody?: unknown;
    responseStatus?: number | null;
    durationMs: number;
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
  }
): Promise<void> {
  await recordIntegrationRequest(logContext.db, {
    organizationId: logContext.organizationId,
    nfeDocumentId: logContext.nfeDocumentId,
    provider: "sap_cpi",
    operation: logContext.operation,
    httpMethod: input.method,
    requestUrl: input.url,
    requestBody: input.requestBody,
    responseBody: input.responseBody,
    responseStatus: input.responseStatus,
    durationMs: input.durationMs,
    success: input.success,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    correlationId: logContext.correlationId,
  });
}

export async function cpiRequestJson<T>(options: {
  method: "GET" | "PUT" | "POST";
  url: string;
  clientId: string;
  clientSecret: string;
  body?: unknown;
  timeoutMs?: number;
  logContext?: CpiIntegrationLogContext;
}): Promise<T> {
  const auth = Buffer.from(`${options.clientId}:${options.clientSecret}`, "utf8").toString(
    "base64"
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const started = performance.now();

  let responseStatus: number | null = null;
  let responseText = "";

  try {
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    };
    const init: RequestInit = {
      method: options.method,
      headers,
      signal: controller.signal,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(options.url, init);
    responseStatus = res.status;
    responseText = await res.text();

    if (!res.ok) {
      const err = new AppError("cpi_request_failed", 502, {
        cause: new Error(`CPI request failed (${res.status}): ${responseText.slice(0, 500)}`),
      });
      if (options.logContext) {
        let responseBody: unknown = responseText;
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          /* keep text */
        }
        await persistCpiRequestLog(options.logContext, {
          method: options.method,
          url: options.url,
          requestBody: options.body,
          responseBody,
          responseStatus,
          durationMs: Math.round(performance.now() - started),
          success: false,
          errorCode: "cpi_request_failed",
          errorMessage: responseText.slice(0, 2000),
        });
      }
      throw err;
    }

    try {
      const parsed = JSON.parse(responseText) as T;
      if (options.logContext) {
        await persistCpiRequestLog(options.logContext, {
          method: options.method,
          url: options.url,
          requestBody: options.body,
          responseBody: parsed,
          responseStatus,
          durationMs: Math.round(performance.now() - started),
          success: true,
        });
      }
      return parsed;
    } catch (parseErr) {
      const err = new AppError("cpi_request_failed", 502, { cause: parseErr });
      if (options.logContext) {
        await persistCpiRequestLog(options.logContext, {
          method: options.method,
          url: options.url,
          requestBody: options.body,
          responseBody: responseText,
          responseStatus,
          durationMs: Math.round(performance.now() - started),
          success: false,
          errorCode: "cpi_request_failed",
          errorMessage: "Invalid JSON response",
        });
      }
      throw err;
    }
  } catch (e) {
    if (e instanceof AppError) throw e;

    const durationMs = Math.round(performance.now() - started);
    let errorCode = "cpi_request_failed";

    if (e instanceof Error && e.name === "AbortError") {
      errorCode = "cpi_request_timeout";
    }

    if (options.logContext) {
      await persistCpiRequestLog(options.logContext, {
        method: options.method,
        url: options.url,
        requestBody: options.body,
        responseBody: responseText ? tryParseJson(responseText) : null,
        responseStatus,
        durationMs,
        success: false,
        errorCode,
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    }

    if (e instanceof Error && e.name === "AbortError") {
      throw new AppError("cpi_request_failed", 504, { cause: e });
    }
    throw new AppError("cpi_request_failed", 502, {
      cause: e instanceof Error ? e : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function cpiGetJson<T>(options: {
  url: string;
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
  logContext?: CpiIntegrationLogContext;
}): Promise<T> {
  return cpiRequestJson<T>({ ...options, method: "GET" });
}

export async function cpiPutJson<T>(options: {
  url: string;
  clientId: string;
  clientSecret: string;
  body: unknown;
  timeoutMs?: number;
  logContext?: CpiIntegrationLogContext;
}): Promise<T> {
  return cpiRequestJson<T>({ ...options, method: "PUT" });
}
