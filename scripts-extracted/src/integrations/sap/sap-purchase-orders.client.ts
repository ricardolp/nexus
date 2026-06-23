import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../../config/env.js";
import { cpiGetJson, type CpiIntegrationLogContext } from "../cpi/cpi-http.client.js";
import type { CpiCredentials } from "../cpi/cpi-credentials.service.js";
import { parsePurchaseOrdersResponse } from "./sap-purchase-orders.parse.js";
import type {
  FetchPurchaseOrdersParams,
  SapPurchaseOrdersRawResponse,
  SapPurchaseOrdersResponse,
} from "./sap-purchase-orders.types.js";

const PURCHASE_ORDERS_NAME = "PurchaseOrders";
const PURCHASE_ORDERS_TYPE = "MERCADORIA";
const CUTOFF_DAYS = 90;

const __dirname = dirname(fileURLToPath(import.meta.url));

export function shouldUseMockPurchaseOrders(env: Env): boolean {
  return env.SAP_MOCK_PO === "true";
}

/** Emission date minus 90 days, format DD-MM-YYYY for SAP cutoffDate. */
export function formatCutoffDate(issuedAt: Date): string {
  const d = new Date(issuedAt.getTime());
  d.setUTCDate(d.getUTCDate() - CUTOFF_DAYS);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function buildPurchaseOrdersQueryParams(
  params: FetchPurchaseOrdersParams,
  options?: { includeCpiMockPo?: boolean }
): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set("sap-client", params.sapClient);
  qs.set("sap-language", params.sapLanguage);
  qs.set("document", params.issuerCnpj.replace(/\D/g, ""));
  qs.set("branchCnpj", params.branchCnpj.replace(/\D/g, ""));
  qs.set("cutoffDate", formatCutoffDate(params.issuedAt));
  qs.set("type", PURCHASE_ORDERS_TYPE);
  qs.set("name", PURCHASE_ORDERS_NAME);
  if (options?.includeCpiMockPo) {
    qs.set("mock_po", "true");
  }
  return qs;
}

export function buildPurchaseOrdersUrl(
  cpiBaseUrl: string,
  query: URLSearchParams
): string {
  const url = new URL(cpiBaseUrl);
  for (const [key, value] of query.entries()) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

let cachedMock: SapPurchaseOrdersResponse | null = null;

export async function loadMockPurchaseOrders(): Promise<SapPurchaseOrdersResponse> {
  if (cachedMock) return cachedMock;
  const path = join(__dirname, "fixtures", "purchase-orders.mock.json");
  const raw = await readFile(path, "utf8");
  cachedMock = parsePurchaseOrdersResponse(JSON.parse(raw) as SapPurchaseOrdersRawResponse);
  return cachedMock;
}

export async function fetchPurchaseOrders(options: {
  env: Env;
  credentials?: CpiCredentials;
  params: FetchPurchaseOrdersParams;
  logContext?: CpiIntegrationLogContext;
}): Promise<SapPurchaseOrdersResponse> {
  if (shouldUseMockPurchaseOrders(options.env)) {
    const mock = await loadMockPurchaseOrders();
    return parsePurchaseOrdersResponse(mock);
  }

  if (!options.credentials) {
    throw new Error("CPI credentials required when SAP_MOCK_PO is false");
  }

  const query = buildPurchaseOrdersQueryParams(options.params, {
    includeCpiMockPo: options.env.SAP_CPI_MOCK_PO === "true",
  });
  const url = buildPurchaseOrdersUrl(options.credentials.cpiBaseUrl, query);
  const body = await cpiGetJson<SapPurchaseOrdersRawResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    logContext: options.logContext,
  });
  return parsePurchaseOrdersResponse(body);
}
