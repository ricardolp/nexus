import type { CpiIntegrationLogContext } from '../cpi-http.client';
import { CpiRequestFailedError, cpiPutJson } from '../cpi-http.client';
import {
  IntegrationRequestLogService,
} from '../integration-request-log.service';
import {
  SapCredentials,
  SapIntegrationConfigService,
} from '../sap-integration-config.service';
import type { MiroResult, SapInboundMiroInput } from './sap-inbound.types';
import { formatSapDocDate } from './sap-delivery.client';

const DEFAULT_MIRO_TIMEOUT_MS = 120_000;

export function resolveMiroTimeoutMs(): number {
  const raw = process.env.SAP_INBOUND_MIRO_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_MIRO_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIRO_TIMEOUT_MS;
}
import { normalizeSapItemNumber } from './sap-purchase-orders.match';
import {
  SAP_INBOUND_MIRO_CURRENCY,
  SAP_INBOUND_MIRO_DOC_TYPE,
  SAP_INBOUND_MIRO_DOCUMENT,
  type SapInboundMiroRequest,
  type SapInboundMiroResponse,
} from './sap-miro.types';

export function buildMiroReference(numero: string, serie: string): string {
  return `${numero}-${serie}`;
}

function formatSapItem(item: string | number): string {
  const normalized = normalizeSapItemNumber(item);
  return normalized ? normalized.padStart(5, '0') : '';
}

const MIRO_INVOICE_NUMBER_KEYS = [
  'invoiceDocNumber',
  'INVOICEDOCNUMBER',
  'invoicedocument',
  'INVOICEDOCUMENT',
  'invoiceDocument',
  'miroNumber',
  'MIRONUMBER',
] as const;

function readDocumentField(
  body: SapInboundMiroResponse,
  keys: readonly string[],
): string | undefined {
  const sources: Record<string, unknown>[] = [body];
  const result = body.RS_RESULT ?? body.rs_result;
  if (result && typeof result === 'object') sources.push(result);

  for (const source of sources) {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
        return String(value);
      }
    }
  }
  return undefined;
}

function readString(
  body: SapInboundMiroResponse,
  ...keys: string[]
): string | undefined {
  return readDocumentField(body, keys);
}

function readMiroInvoiceNumber(body: SapInboundMiroResponse): string | undefined {
  return readDocumentField(body, MIRO_INVOICE_NUMBER_KEYS);
}

function hasMiroInvoiceNumber(body: Record<string, unknown>): boolean {
  return MIRO_INVOICE_NUMBER_KEYS.some((key) => {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return true;
    if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
      return true;
    }
    return false;
  });
}

export function normalizeMiroResponseBody(
  raw: unknown,
): SapInboundMiroResponse {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  let body: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  const rsResult = body.RS_RESULT ?? body.rs_result;
  if (rsResult && typeof rsResult === 'object' && !Array.isArray(rsResult)) {
    body = { ...body, ...(rsResult as Record<string, unknown>) };
  }

  if (!hasMiroInvoiceNumber(body)) {
    const wrapperKeys = Object.keys(body).filter(
      (key) =>
        !['RS_RESULT', 'rs_result', 'erros', 'ERROS', 'return', 'RETURN'].includes(
          key,
        ),
    );
    if (wrapperKeys.length === 1) {
      const nested = body[wrapperKeys[0]!];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedRecord = nested as Record<string, unknown>;
        if (hasMiroInvoiceNumber(nestedRecord)) {
          body = { ...body, ...nestedRecord };
        }
      }
    }
  }

  return body as SapInboundMiroResponse;
}

export function tryParseMiroResponseBody(
  raw: unknown,
): SapInboundMiroResponse | null {
  try {
    return parseMiroResponse(normalizeMiroResponseBody(raw));
  } catch {
    return null;
  }
}

function readFiscalYear(body: SapInboundMiroResponse): string | undefined {
  const result = body.RS_RESULT ?? body.rs_result;
  const candidates = [
    body.fiscalyear,
    body.fiscalYear,
    body.FISCALYEAR,
    result && typeof result === 'object' ? result.fiscalyear : undefined,
    result && typeof result === 'object' ? result.fiscal_year : undefined,
    result && typeof result === 'object' ? result.FISCALYEAR : undefined,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && !Number.isNaN(value) && value !== 0) {
      return String(value);
    }
  }
  return undefined;
}

function readReturnType(entry: Record<string, unknown>): string {
  const t = entry.type ?? entry.TYPE ?? entry.Type ?? entry.msgty ?? entry.MSGTY;
  return typeof t === 'string' ? t.trim().toUpperCase() : '';
}

function collectErrors(body: SapInboundMiroResponse): string[] {
  const messages: string[] = [];

  const pushFromArray = (arr: unknown[] | undefined) => {
    for (const entry of arr ?? []) {
      if (typeof entry === 'string' && entry.trim()) {
        messages.push(entry.trim());
        continue;
      }
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const msg = o.message ?? o.MESSAGE ?? o.msg ?? o.MENSAGEM ?? o.text ?? o.TEXT;
      if (typeof msg === 'string' && msg.trim()) messages.push(msg.trim());
    }
  };

  pushFromArray(Array.isArray(body.erros) ? body.erros : undefined);
  pushFromArray(Array.isArray(body.ERROS) ? body.ERROS : undefined);

  const pushBapiStyle = (arr: unknown[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const type = readReturnType(o);
      if (type !== 'E' && type !== 'A') continue;
      const msg = o.message ?? o.MESSAGE ?? o.msg ?? o.MENSAGEM ?? o.text ?? o.TEXT;
      if (typeof msg === 'string' && msg.trim()) messages.push(msg.trim());
    }
  };

  pushBapiStyle(Array.isArray(body.message) ? body.message : undefined);
  pushBapiStyle(Array.isArray(body.MESSAGE) ? body.MESSAGE : undefined);
  pushBapiStyle(Array.isArray(body.return) ? body.return : undefined);
  pushBapiStyle(Array.isArray(body.RETURN) ? body.RETURN : undefined);

  return [...new Set(messages)].filter(Boolean);
}

export function buildInboundMiroPayload(
  input: SapInboundMiroInput,
): SapInboundMiroRequest {
  const firstOrder = input.orderRefs[0]?.sapOrderNumber ?? '';
  const docDate = formatSapDocDate(input.datadoc);
  const postingDate = formatSapDocDate(input.datalanc);

  return {
    document: SAP_INBOUND_MIRO_DOCUMENT,
    protocoloConsulta:
      input.protocoloConsulta ?? `MIRO-${firstOrder || 'SEMPO'}-001`,
    header: {
      company_code: input.companyCode ?? '',
      doc_type: input.docType ?? SAP_INBOUND_MIRO_DOC_TYPE,
      doc_date: docDate,
      posting_date: postingDate,
      reference: buildMiroReference(input.numero, input.serie),
      gross_amount: input.valorTotal,
      currency: input.currency ?? SAP_INBOUND_MIRO_CURRENCY,
      calc_tax: input.calcTax ?? true,
      header_text: input.headerText ?? input.nfeAccessKey,
      payment_terms: input.paymentTerms ?? '',
      baseline_date: docDate,
      partner_bank: input.partnerBank ?? '',
      invoice_ind: input.invoiceInd ?? true,
      simulate: input.simulate ?? false,
    },
    items: input.orderRefs.map((ref) => ({
      po_number: ref.sapOrderNumber,
      po_item: formatSapItem(ref.sapOrderItem),
      nf_item: String(ref.nfItem),
      quantity: ref.qty,
      item_amount: ref.itemAmount,
      tax_code: ref.taxCode ?? '',
      nf_unit: ref.nfUnit,
      po_unit: ref.poUnit,
    })),
  };
}

export function parseMiroResponse(
  rawBody: SapInboundMiroResponse,
): SapInboundMiroResponse {
  const body = normalizeMiroResponseBody(rawBody);
  const errors = collectErrors(body);
  if (errors.length > 0) {
    throw new Error(`SAP MIRO errors: ${errors.join('; ')}`);
  }

  const miroNumber = readMiroInvoiceNumber(body);
  if (!miroNumber) {
    throw new Error('SAP MIRO response missing invoice document number');
  }
  return body;
}

export function mapMiroResponse(
  body: SapInboundMiroResponse,
  input: SapInboundMiroInput,
): MiroResult {
  const miroNumber = readMiroInvoiceNumber(body) ?? '';
  const fiscalYear =
    readFiscalYear(body) ??
    input.fiscalYear ??
    String(new Date().getUTCFullYear());
  const accountingDocNumber = readString(
    body,
    'accountingdocument',
    'accountingDocument',
    'ACCOUNTINGDOCUMENT',
  );

  return {
    miroNumber,
    fiscalYear,
    accountingDocNumber,
    lines: input.orderRefs.map((ref, idx) => ({
      docNumber: miroNumber,
      itemNumber: formatSapItem(ref.sapOrderItem),
      fiscalYear,
      nfeItemLine: idx + 1,
    })),
    rawResponse: body as Record<string, unknown>,
  };
}

async function requestInboundMiro(
  options: {
    configService: SapIntegrationConfigService;
    logService: IntegrationRequestLogService;
    credentials: SapCredentials;
    input: SapInboundMiroInput;
    logContext?: CpiIntegrationLogContext;
  },
): Promise<SapInboundMiroResponse> {
  const payload = buildInboundMiroPayload(options.input);
  const url = options.configService.buildCpiBaseUrl(options.credentials);

  try {
    return await cpiPutJson<SapInboundMiroResponse>({
      url,
      clientId: options.credentials.clientId,
      clientSecret: options.credentials.clientSecret,
      body: payload,
      timeoutMs: resolveMiroTimeoutMs(),
      logContext: options.logContext,
      logService: options.logService,
    });
  } catch (error) {
    if (error instanceof CpiRequestFailedError) {
      const recovered = tryParseMiroResponseBody(error.responseBody);
      if (recovered) {
        return recovered;
      }
    }
    throw error;
  }
}

export async function postInboundMiro(options: {
  configService: SapIntegrationConfigService;
  logService: IntegrationRequestLogService;
  credentials: SapCredentials;
  input: SapInboundMiroInput;
  logContext?: CpiIntegrationLogContext;
}): Promise<MiroResult> {
  const body = await requestInboundMiro(options);
  return mapMiroResponse(parseMiroResponse(body), options.input);
}
