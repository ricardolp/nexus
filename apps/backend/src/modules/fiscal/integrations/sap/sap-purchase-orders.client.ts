import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { cpiGetJson, type CpiIntegrationLogContext } from '../cpi-http.client';
import {
  IntegrationRequestLogService,
} from '../integration-request-log.service';
import {
  SapCredentials,
  SapIntegrationConfigService,
} from '../sap-integration-config.service';
import { parsePurchaseOrdersResponse } from './sap-purchase-orders.parse';
import type {
  FetchPurchaseOrdersParams,
  SapPurchaseOrdersRawResponse,
  SapPurchaseOrdersResponse,
} from './sap-purchase-orders.types';

const PURCHASE_ORDERS_NAME = 'PurchaseOrders';
const PURCHASE_ORDERS_TYPE = 'MERCADORIA';
const CUTOFF_DAYS = 90;

export function formatCutoffDate(issuedAt: Date): string {
  const d = new Date(issuedAt.getTime());
  d.setUTCDate(d.getUTCDate() - CUTOFF_DAYS);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

export function buildPurchaseOrdersQueryParams(
  params: FetchPurchaseOrdersParams,
): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('sap-client', params.sapClient);
  qs.set('sap-language', params.sapLanguage);
  qs.set('document', params.issuerCnpj.replace(/\D/g, ''));
  qs.set('branchCnpj', params.branchCnpj.replace(/\D/g, ''));
  qs.set('cutoffDate', formatCutoffDate(params.issuedAt));
  qs.set('type', PURCHASE_ORDERS_TYPE);
  qs.set('name', PURCHASE_ORDERS_NAME);
  return qs;
}

let cachedMock: SapPurchaseOrdersResponse | null = null;

function resolveMockFixturePath(): string {
  const candidates = [
    join(__dirname, 'fixtures', 'purchase-orders.mock.json'),
    join(
      process.cwd(),
      'src',
      'modules',
      'fiscal',
      'integrations',
      'sap',
      'fixtures',
      'purchase-orders.mock.json',
    ),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Mock de pedidos SAP não encontrado. Caminhos tentados: ${candidates.join(', ')}`,
    );
  }
  return found;
}

export async function loadMockPurchaseOrders(): Promise<SapPurchaseOrdersResponse> {
  if (cachedMock) return cachedMock;
  const path = resolveMockFixturePath();
  const raw = await readFile(path, 'utf8');
  cachedMock = parsePurchaseOrdersResponse(
    JSON.parse(raw) as SapPurchaseOrdersRawResponse,
  );
  return cachedMock;
}

export async function fetchPurchaseOrders(options: {
  configService: SapIntegrationConfigService;
  logService: IntegrationRequestLogService;
  credentials?: SapCredentials;
  params: FetchPurchaseOrdersParams;
  logContext?: CpiIntegrationLogContext;
}): Promise<SapPurchaseOrdersResponse> {
  if (options.configService.shouldUseMock()) {
    return loadMockPurchaseOrders();
  }

  if (!options.credentials) {
    throw new Error('SAP credentials required when SAP_MOCK_PO is false');
  }

  const query = buildPurchaseOrdersQueryParams(options.params);
  const url = options.configService.buildCpiUrl(options.credentials, query);

  const body = await cpiGetJson<SapPurchaseOrdersRawResponse>({
    url,
    clientId: options.credentials.clientId,
    clientSecret: options.credentials.clientSecret,
    logContext: options.logContext,
    logService: options.logService,
  });
  return parsePurchaseOrdersResponse(body);
}
