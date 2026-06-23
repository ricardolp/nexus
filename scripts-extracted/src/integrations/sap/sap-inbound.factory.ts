import type { Env } from "../../config/env.js";
import {
  type DbConn,
  getOrganizationCpiIntegrationRow,
  isCpiIntegrationComplete,
} from "../cpi/cpi-credentials.service.js";
import { CpiSapInboundAdapter } from "./cpi-sap-inbound.adapter.js";
import type { SapInboundAdapterContext } from "./sap-inbound.context.js";
import type { SapInboundAdapter } from "./sap-inbound.types.js";
import { shouldUseMockPurchaseOrders } from "./sap-purchase-orders.client.js";
import { StubSapInboundAdapter } from "./stub-sap-inbound.adapter.js";

export type { SapInboundAdapterContext };

let stubInstance: StubSapInboundAdapter | null = null;

function getStubAdapter(): StubSapInboundAdapter {
  if (!stubInstance) stubInstance = new StubSapInboundAdapter();
  return stubInstance;
}

export async function canUseCpiPurchaseOrderValidation(
  db: DbConn,
  env: Env,
  organizationId: string
): Promise<boolean> {
  if (shouldUseMockPurchaseOrders(env)) return true;
  const row = await getOrganizationCpiIntegrationRow(db, organizationId);
  return isCpiIntegrationComplete(row);
}

export async function getSapInboundAdapter(
  ctx: SapInboundAdapterContext
): Promise<SapInboundAdapter> {
  const useCpi = await canUseCpiPurchaseOrderValidation(ctx.db, ctx.env, ctx.organizationId);
  if (useCpi) {
    return new CpiSapInboundAdapter(ctx);
  }
  return getStubAdapter();
}

/** MIGO/MIRO still use stub until CPI endpoints exist. */
export function getSapInboundStubAdapter(): SapInboundAdapter {
  return getStubAdapter();
}
