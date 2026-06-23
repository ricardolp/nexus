import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';
import {
  integration_operation,
  integration_provider,
} from '@prisma/client';

export type IntegrationOperation =
  | 'purchase_orders'
  | 'inbound_delivery'
  | 'inbound_miro';

export type RecordIntegrationRequestInput = {
  organizationId: string;
  nfeDocumentId?: string;
  provider: 'sap_cpi';
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

const SENSITIVE_KEYS = new Set([
  'authorization',
  'clientsecret',
  'client_secret',
  'password',
  'secret',
]);

const MAX_BODY_BYTES = 32_000;

@Injectable()
export class IntegrationRequestLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordIntegrationRequestInput): Promise<void> {
    await this.prisma.integrationRequestLog.create({
      data: {
        organization_id: input.organizationId,
        nfe_document_id: input.nfeDocumentId ?? null,
        provider: input.provider as integration_provider,
        operation: input.operation as integration_operation,
        http_method: input.httpMethod,
        request_url: input.requestUrl,
        request_body: this.prepareBody(input.requestBody) as object | undefined,
        response_body: this.prepareBody(input.responseBody) as
          | object
          | undefined,
        response_status: input.responseStatus ?? null,
        duration_ms: input.durationMs,
        success: input.success,
        error_code: input.errorCode ?? null,
        error_message: input.errorMessage ?? null,
        correlation_id: input.correlationId ?? null,
      },
    });
  }

  private prepareBody(value: unknown): unknown {
    if (value === undefined) return null;
    return this.truncateJson(this.redact(value));
  }

  private redact(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((v) => this.redact(v));
    if (typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? '[REDACTED]'
        : this.redact(val);
    }
    return out;
  }

  private truncateJson(value: unknown): unknown {
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      return { _truncated: true, _preview: String(value).slice(0, 500) };
    }
    if (serialized.length <= MAX_BODY_BYTES) return value;
    return {
      _truncated: true,
      _preview: serialized.slice(0, MAX_BODY_BYTES),
      _originalBytes: serialized.length,
    };
  }
}
