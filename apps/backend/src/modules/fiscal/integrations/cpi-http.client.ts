import { ValidationError } from '@nexus/shared';
import {
  IntegrationRequestLogService,
  type IntegrationOperation,
} from './integration-request-log.service';

const DEFAULT_TIMEOUT_MS = 30_000;

export class CpiRequestFailedError extends ValidationError {
  constructor(
    readonly responseStatus: number,
    readonly responseBody: unknown,
    errorCode = 'cpi_request_failed',
  ) {
    super(errorCode);
  }
}

export type CpiIntegrationLogContext = {
  organizationId: string;
  operation: IntegrationOperation;
  nfeDocumentId?: string;
  correlationId?: string;
};

export type CpiResponseEvaluation = {
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export async function cpiRequestJson<T>(options: {
  method: 'GET' | 'PUT' | 'POST';
  url: string;
  clientId: string;
  clientSecret: string;
  body?: unknown;
  timeoutMs?: number;
  logContext?: CpiIntegrationLogContext;
  logService?: IntegrationRequestLogService;
  evaluateResponse?: (body: T) => CpiResponseEvaluation | null | undefined;
}): Promise<T> {
  const auth = Buffer.from(
    `${options.clientId}:${options.clientSecret}`,
    'utf8',
  ).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const started = performance.now();

  let responseStatus: number | null = null;
  let responseText = '';

  const persist = async (input: {
    success: boolean;
    responseBody?: unknown;
    errorCode?: string;
    errorMessage?: string;
  }) => {
    if (!options.logContext || !options.logService) return;
    await options.logService.record({
      organizationId: options.logContext.organizationId,
      nfeDocumentId: options.logContext.nfeDocumentId,
      provider: 'sap_cpi',
      operation: options.logContext.operation,
      httpMethod: options.method,
      requestUrl: options.url,
      requestBody: options.body,
      responseBody: input.responseBody,
      responseStatus,
      durationMs: Math.round(performance.now() - started),
      success: input.success,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      correlationId: options.logContext.correlationId,
    });
  };

  try {
    const headers: Record<string, string> = {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    };
    const init: RequestInit = {
      method: options.method,
      headers,
      signal: controller.signal,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(options.url, init);
    responseStatus = res.status;
    responseText = await res.text();

    if (!res.ok) {
      let responseBody: unknown = responseText;
      try {
        responseBody = JSON.parse(responseText);
      } catch {
        /* keep text */
      }
      await persist({
        success: false,
        responseBody,
        errorCode: 'cpi_request_failed',
        errorMessage: responseText.slice(0, 2000),
      });
      throw new CpiRequestFailedError(res.status, responseBody);
    }

    try {
      const parsed = JSON.parse(responseText) as T;
      const evaluation = options.evaluateResponse?.(parsed);
      if (evaluation && !evaluation.success) {
        await persist({
          success: false,
          responseBody: parsed,
          errorCode: evaluation.errorCode ?? 'sap_business_error',
          errorMessage: evaluation.errorMessage,
        });
      } else {
        await persist({ success: true, responseBody: parsed });
      }
      return parsed;
    } catch {
      await persist({
        success: false,
        responseBody: responseText,
        errorCode: 'cpi_request_failed',
        errorMessage: 'Invalid JSON response',
      });
      throw new ValidationError('cpi_request_failed');
    }
  } catch (e) {
    if (e instanceof ValidationError) throw e;

    const errorCode =
      e instanceof Error && e.name === 'AbortError'
        ? 'cpi_request_timeout'
        : 'cpi_request_failed';

    const detail = e instanceof Error ? e.message : String(e);
    await persist({
      success: false,
      responseBody: responseText ? tryParseJson(responseText) : null,
      errorCode,
      errorMessage: detail,
    });

    throw new ValidationError(`${errorCode}: ${detail}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function cpiGetJson<T>(
  options: Omit<Parameters<typeof cpiRequestJson<T>>[0], 'method'>,
): Promise<T> {
  return cpiRequestJson<T>({ ...options, method: 'GET' });
}

export async function cpiPutJson<T>(
  options: Omit<Parameters<typeof cpiRequestJson<T>>[0], 'method'> & {
    body: unknown;
  },
): Promise<T> {
  return cpiRequestJson<T>({ ...options, method: 'PUT' });
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
