import type { Env } from "../../config/env.js";
import { cpiPutJson, type CpiIntegrationLogContext } from "../cpi/cpi-http.client.js";
import type { CpiCredentials } from "../cpi/cpi-credentials.service.js";
import type { DeliveryPortariaResult, DeliveryResult } from "./sap-inbound.types.js";
import { normalizeSapItemNumber } from "./sap-purchase-orders.match.js";
import {
  SAP_INBOUND_DELIVERY_DOCUMENT,
  SAP_INBOUND_DELIVERY_POST_DOCUMENT,
  SAP_INBOUND_DELIVERY_TIPO,
  type CreateInboundDeliveryInput,
  type SapInboundDeliveryRequest,
  type SapInboundDeliveryResponse,
} from "./sap-delivery.types.js";

export function formatSapDocDate(issuedAt: Date): string {
  const y = issuedAt.getUTCFullYear();
  const m = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(issuedAt.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function formatSapPedidoItemForDelivery(item: string | number): string {
  const normalized = normalizeSapItemNumber(item);
  if (!normalized) return "";
  return normalized.padStart(5, "0");
}

export function buildInboundDeliveryPayload(
  input: CreateInboundDeliveryInput
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

export function buildInboundDeliveryUrl(cpiBaseUrl: string, sapClient: string): string {
  const url = new URL(cpiBaseUrl);
  url.searchParams.set("sap-client", sapClient);
  return url.toString();
}

function readStringField(body: SapInboundDeliveryResponse, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function readDeliveryNumbersList(body: SapInboundDeliveryResponse): string[] {
  const raw =
    body.deliverynumbers ?? body.deliveryNumbers ?? body.DELIVERYNUMBERS ?? body.DeliveryNumbers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => (typeof v === "string" ? v.trim() : String(v).trim()))
    .filter(Boolean);
}

export function readDeliveryNumber(
  body: SapInboundDeliveryResponse,
  fallbackNumero: string
): string {
  const fromList = readDeliveryNumbersList(body);
  if (fromList.length > 0) return fromList[0]!;

  const single = readStringField(
    body,
    "deliverynumber",
    "deliveryNumber",
    "DELIVERYNUMBER"
  );
  if (single) return single;

  return fallbackNumero;
}

function readFiscalYear(body: SapInboundDeliveryResponse): string | undefined {
  const candidates = [body.ano, body.ANO, body.GJAHR, body.fiscalYear];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && !Number.isNaN(value) && value !== 0) return String(value);
  }
  return undefined;
}

export function readMaterialDocument(body: SapInboundDeliveryResponse): string {
  return (
    readStringField(body, "materialdocument", "MATERIALDOCUMENT", "materialDocument") ?? ""
  );
}

export function readMatDocumentYear(body: SapInboundDeliveryResponse): string | undefined {
  const candidates = [
    body.matdocumentyear,
    body.MATDOCUMENTYEAR,
    body.matDocumentYear,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && !Number.isNaN(value) && value !== 0) {
      return String(value);
    }
  }
  return undefined;
}

function readSapReturnType(entry: Record<string, unknown>): string {
  const t = entry.type ?? entry.TYPE ?? entry.Type ?? entry.msgty ?? entry.MSGTY;
  return typeof t === "string" ? t.trim().toUpperCase() : "";
}

/** BAPI/CPI: erros[] plus MESSAGE/RETURN lines with type E (error) or A (abort). */
export function collectSapInboundDeliveryErrors(body: SapInboundDeliveryResponse): string[] {
  const messages: string[] = [];

  const pushFromArray = (arr: unknown[] | undefined) => {
    for (const entry of arr ?? []) {
      if (typeof entry === "string" && entry.trim()) {
        messages.push(entry.trim());
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const msg = o.message ?? o.MESSAGE ?? o.msg ?? o.MENSAGEM ?? o.text ?? o.TEXT;
      if (typeof msg === "string" && msg.trim()) messages.push(msg.trim());
    }
  };

  pushFromArray(Array.isArray(body.erros) ? body.erros : undefined);
  pushFromArray(Array.isArray(body.ERROS) ? body.ERROS : undefined);

  const pushBapiStyle = (arr: unknown[] | undefined) => {
    if (!Array.isArray(arr)) return;
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const type = readSapReturnType(o);
      if (type !== "E" && type !== "A") continue;
      const msg = o.message ?? o.MESSAGE ?? o.msg ?? o.MENSAGEM ?? o.text ?? o.TEXT;
      if (typeof msg === "string" && msg.trim()) messages.push(msg.trim());
    }
  };

  pushBapiStyle(Array.isArray(body.message) ? body.message : undefined);
  pushBapiStyle(Array.isArray(body.MESSAGE) ? body.MESSAGE : undefined);
  pushBapiStyle(Array.isArray(body.return) ? body.return : undefined);
  pushBapiStyle(Array.isArray(body.RETURN) ? body.RETURN : undefined);

  return [...new Set(messages)].filter(Boolean);
}

export function mapDeliveryResponse(
  body: SapInboundDeliveryResponse,
  input: CreateInboundDeliveryInput
): DeliveryResult {
  const deliveryNumber = readDeliveryNumber(body, "");
  const fiscalYear = readFiscalYear(body) ?? String(new Date().getUTCFullYear());

  return {
    deliveryNumber,
    fiscalYear,
    lines: input.orderRefs.map((ref, idx) => ({
      docNumber: deliveryNumber,
      itemNumber: formatSapPedidoItemForDelivery(ref.sapOrderItem),
      fiscalYear,
      nfeItemLine: idx + 1,
    })),
    rawResponse: body as Record<string, unknown>,
  };
}

export function parseDeliveryResponse(body: SapInboundDeliveryResponse): SapInboundDeliveryResponse {
  const sapErrors = collectSapInboundDeliveryErrors(body);
  if (sapErrors.length > 0) {
    throw new Error(`SAP delivery errors: ${sapErrors.join("; ")}`);
  }

  const deliveryNumber = readDeliveryNumber(body, "");

  if (!deliveryNumber) {
    throw new Error("SAP delivery response missing deliverynumber");
  }

  return body;
}

export function parsePortariaResponse(body: SapInboundDeliveryResponse): SapInboundDeliveryResponse {
  const sapErrors = collectSapInboundDeliveryErrors(body);
  if (sapErrors.length > 0) {
    throw new Error(`SAP portaria errors: ${sapErrors.join("; ")}`);
  }

  const migoNumber = readMaterialDocument(body);
  if (!migoNumber) {
    throw new Error("SAP portaria response missing materialdocument");
  }

  return body;
}

export function mapPortariaResponse(
  body: SapInboundDeliveryResponse,
  input: CreateInboundDeliveryInput
): DeliveryPortariaResult {
  const migoNumber = readMaterialDocument(body);
  const migoFiscalYear =
    readMatDocumentYear(body) ?? String(new Date().getUTCFullYear());
  const deliveryNumber = input.delivery?.trim() ?? readDeliveryNumber(body, "");

  return {
    deliveryNumber,
    fiscalYear: migoFiscalYear,
    migoNumber,
    migoFiscalYear,
    lines: input.orderRefs.map((ref, idx) => ({
      docNumber: migoNumber,
      itemNumber: formatSapPedidoItemForDelivery(ref.sapOrderItem),
      fiscalYear: migoFiscalYear,
      nfeItemLine: idx + 1,
    })),
    rawResponse: body as Record<string, unknown>,
  };
}

export async function postInboundDelivery(options: {
  env: Env;
  credentials: CpiCredentials;
  input: CreateInboundDeliveryInput;
  logContext?: CpiIntegrationLogContext;
}): Promise<DeliveryResult> {
  const payload = buildInboundDeliveryPayload(options.input);
  const url = buildInboundDeliveryUrl(
    options.credentials.cpiBaseUrl,
    options.credentials.sapClient
  );
  const body = await cpiPutJson<SapInboundDeliveryResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    body: payload,
    logContext: options.logContext,
  });
  return mapDeliveryResponse(parseDeliveryResponse(body), options.input);
}

export async function postInboundDeliveryPortaria(options: {
  env: Env;
  credentials: CpiCredentials;
  input: CreateInboundDeliveryInput;
  logContext?: CpiIntegrationLogContext;
}): Promise<DeliveryPortariaResult> {
  const payload = buildInboundDeliveryPayload({
    ...options.input,
    document: SAP_INBOUND_DELIVERY_POST_DOCUMENT,
  });
  const url = buildInboundDeliveryUrl(
    options.credentials.cpiBaseUrl,
    options.credentials.sapClient
  );
  const body = await cpiPutJson<SapInboundDeliveryResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    body: payload,
    logContext: options.logContext,
  });
  return mapPortariaResponse(parsePortariaResponse(body), options.input);
}
