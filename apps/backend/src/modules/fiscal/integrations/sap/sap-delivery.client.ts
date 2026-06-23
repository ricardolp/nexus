import type { CpiIntegrationLogContext } from '../cpi-http.client';
import { cpiPutJson } from '../cpi-http.client';
import {
  IntegrationRequestLogService,
} from '../integration-request-log.service';
import {
  SapCredentials,
  SapIntegrationConfigService,
} from '../sap-integration-config.service';
import type { DeliveryPortariaResult, DeliveryResult } from './sap-inbound.types';
import { normalizeSapItemNumber } from './sap-purchase-orders.match';
import {
  SAP_INBOUND_DELIVERY_DOCUMENT,
  SAP_INBOUND_DELIVERY_POST_DOCUMENT,
  SAP_INBOUND_DELIVERY_TIPO,
  type CreateInboundDeliveryInput,
  type SapInboundDeliveryRequest,
  type SapInboundDeliveryResponse,
} from './sap-delivery.types';

export function formatSapDocDate(issuedAt: Date): string {
  const y = issuedAt.getUTCFullYear();
  const m = String(issuedAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(issuedAt.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function formatSapPedidoItemForDelivery(item: string | number): string {
  const normalized = normalizeSapItemNumber(item);
  if (!normalized) return '';
  return normalized.padStart(5, '0');
}

export function buildInboundDeliveryPayload(
  input: CreateInboundDeliveryInput,
): SapInboundDeliveryRequest {
  return {
    document: input.document ?? SAP_INBOUND_DELIVERY_DOCUMENT,
    numero: input.numero,
    serie: input.serie,
    datadoc: input.datadoc,
    tipo_documento: input.tipoDocumento ?? SAP_INBOUND_DELIVERY_TIPO,
    pedidoscompra: input.orderRefs.map((ref) => ({
      pedido: ref.sapOrderNumber,
      item: formatSapPedidoItemForDelivery(ref.sapOrderItem),
      quantidade: ref.qty,
      component: ref.materialCode,
    })),
    delivery: input.delivery,
  };
}

function readStringField(
  body: SapInboundDeliveryResponse,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readDeliveryNumbersList(body: SapInboundDeliveryResponse): string[] {
  const raw =
    body.deliverynumbers ??
    body.deliveryNumbers ??
    body.DELIVERYNUMBERS ??
    body.DeliveryNumbers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
    .filter(Boolean);
}

export function readDeliveryNumber(
  body: SapInboundDeliveryResponse,
  fallbackNumero: string,
): string {
  const fromList = readDeliveryNumbersList(body);
  if (fromList.length > 0) return fromList[0]!;
  const single = readStringField(
    body,
    'deliverynumber',
    'deliveryNumber',
    'DELIVERYNUMBER',
  );
  return single ?? fallbackNumero;
}

function readFiscalYear(body: SapInboundDeliveryResponse): string | undefined {
  const candidates = [body.ano, body.ANO, body.GJAHR, body.fiscalYear];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
      return String(value);
    }
  }
  return undefined;
}

export function readMaterialDocument(body: SapInboundDeliveryResponse): string {
  return (
    readStringField(
      body,
      'materialdocument',
      'MATERIALDOCUMENT',
      'materialDocument',
    ) ?? ''
  );
}

export function readMatDocumentYear(
  body: SapInboundDeliveryResponse,
): string | undefined {
  const candidates = [
    body.matdocumentyear,
    body.MATDOCUMENTYEAR,
    body.matDocumentYear,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
      return String(value);
    }
  }
  return undefined;
}

function readSapReturnType(entry: Record<string, unknown>): string {
  const t =
    entry.type ??
    entry.TYPE ??
    entry.Type ??
    entry.msgty ??
    entry.MSGTY ??
    entry.msgtyp ??
    entry.MSGTYP;
  return typeof t === 'string' ? t.trim().toUpperCase() : '';
}

function formatSapBapiMessage(entry: Record<string, unknown>): string | undefined {
  const direct =
    entry.message ??
    entry.MESSAGE ??
    entry.msg ??
    entry.MENSAGEM ??
    entry.text ??
    entry.TEXT;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const parts: string[] = [];
  const id = entry.id ?? entry.ID;
  const number = entry.number ?? entry.NUMBER;
  if (typeof id === 'string' && id.trim()) parts.push(id.trim());
  if (typeof number === 'number' && !Number.isNaN(number) && number !== 0) {
    parts.push(String(number));
  } else if (typeof number === 'string' && number.trim()) {
    parts.push(number.trim());
  }

  for (const key of [
    'messageV1',
    'messageV2',
    'messageV3',
    'messageV4',
    'MESSAGEV1',
    'MESSAGEV2',
    'MESSAGEV3',
    'MESSAGEV4',
  ]) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) parts.push(value.trim());
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** BAPI/CPI: erros[] plus MESSAGE/RETURN lines with type E (error) or A (abort). */
export function collectSapInboundDeliveryErrors(
  body: SapInboundDeliveryResponse,
): string[] {
  const messages: string[] = [];

  const pushFromArray = (arr: unknown[] | undefined) => {
    for (const entry of arr ?? []) {
      if (typeof entry === 'string' && entry.trim()) {
        messages.push(entry.trim());
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const formatted = formatSapBapiMessage(entry as Record<string, unknown>);
      if (formatted) messages.push(formatted);
    }
  };

  pushFromArray(Array.isArray(body.erros) ? body.erros : undefined);
  pushFromArray(Array.isArray(body.ERROS) ? body.ERROS : undefined);

  const pushBapiStyle = (arr: unknown[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const type = readSapReturnType(o);
      if (type !== 'E' && type !== 'A') continue;
      const formatted = formatSapBapiMessage(o);
      if (formatted) messages.push(formatted);
    }
  };

  pushBapiStyle(Array.isArray(body.message) ? body.message : undefined);
  pushBapiStyle(Array.isArray(body.MESSAGE) ? body.MESSAGE : undefined);
  pushBapiStyle(Array.isArray(body.return) ? body.return : undefined);
  pushBapiStyle(Array.isArray(body.RETURN) ? body.RETURN : undefined);

  return [...new Set(messages)].filter(Boolean);
}

function evaluateInboundDeliveryResponse(
  body: SapInboundDeliveryResponse,
): { success: false; errorMessage: string } | null {
  const errors = collectSapInboundDeliveryErrors(body);
  if (errors.length > 0) {
    return { success: false, errorMessage: errors.join('; ') };
  }
  return null;
}

function parseDeliveryResponse(
  body: SapInboundDeliveryResponse,
  input: CreateInboundDeliveryInput,
): DeliveryResult {
  const errors = collectSapInboundDeliveryErrors(body);
  if (errors.length > 0) {
    throw new Error(`SAP delivery errors: ${errors.join('; ')}`);
  }

  const deliveryNumber = readDeliveryNumber(body, '');
  if (!deliveryNumber) {
    throw new Error('SAP delivery response missing deliverynumber');
  }
  const fiscalYear = readFiscalYear(body) ?? String(new Date().getFullYear());

  return {
    deliveryNumber,
    fiscalYear,
    lines: input.orderRefs.map((ref, i) => ({
      docNumber: deliveryNumber,
      itemNumber: formatSapPedidoItemForDelivery(ref.sapOrderItem),
      fiscalYear,
      nfeItemLine: i + 1,
    })),
    rawResponse: body as Record<string, unknown>,
  };
}

export async function postInboundDelivery(options: {
  configService: SapIntegrationConfigService;
  logService: IntegrationRequestLogService;
  credentials: SapCredentials;
  input: CreateInboundDeliveryInput;
  logContext?: CpiIntegrationLogContext;
}): Promise<DeliveryResult> {
  const url = options.configService.buildCpiBaseUrl(options.credentials);
  const body = await cpiPutJson<SapInboundDeliveryResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    body: buildInboundDeliveryPayload(options.input),
    logContext: options.logContext,
    logService: options.logService,
    evaluateResponse: evaluateInboundDeliveryResponse,
  });
  return parseDeliveryResponse(body, options.input);
}

export async function postInboundDeliveryPortaria(options: {
  configService: SapIntegrationConfigService;
  logService: IntegrationRequestLogService;
  credentials: SapCredentials;
  input: CreateInboundDeliveryInput;
  logContext?: CpiIntegrationLogContext;
}): Promise<DeliveryPortariaResult> {
  const url = options.configService.buildCpiBaseUrl(options.credentials);
  const payload = buildInboundDeliveryPayload({
    ...options.input,
    document: SAP_INBOUND_DELIVERY_POST_DOCUMENT,
  });
  const body = await cpiPutJson<SapInboundDeliveryResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    body: payload,
    logContext: options.logContext,
    logService: options.logService,
    evaluateResponse: evaluateInboundDeliveryResponse,
  });

  const errors = collectSapInboundDeliveryErrors(body);
  if (errors.length > 0) {
    throw new Error(`SAP portaria errors: ${errors.join('; ')}`);
  }

  const deliveryNumber =
    options.input.delivery?.trim() ??
    readDeliveryNumber(body, options.input.numero);
  const migoNumber = readMaterialDocument(body);
  const migoFiscalYear =
    readMatDocumentYear(body) ?? String(new Date().getFullYear());

  return {
    deliveryNumber,
    fiscalYear: readFiscalYear(body),
    migoNumber: migoNumber || deliveryNumber,
    migoFiscalYear,
    lines: options.input.orderRefs.map((ref, i) => ({
      docNumber: migoNumber || deliveryNumber,
      itemNumber: formatSapPedidoItemForDelivery(ref.sapOrderItem),
      fiscalYear: migoFiscalYear,
      nfeItemLine: i + 1,
    })),
    rawResponse: body as Record<string, unknown>,
  };
}
