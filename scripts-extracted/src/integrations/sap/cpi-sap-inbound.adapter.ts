import type { CpiIntegrationLogContext } from "../cpi/cpi-http.client.js";
import {
  getCpiCredentials,
  getOrganizationCpiIntegrationRow,
} from "../cpi/cpi-credentials.service.js";
import type {
  DeliveryPortariaResult,
  DeliveryResult,
  MigoResult,
  MiroResult,
  PedidoValidationResult,
  SapInboundAdapter,
  SapPedidoLineInput,
} from "./sap-inbound.types.js";
import type { SapInboundAdapterContext } from "./sap-inbound.context.js";
import { StubSapInboundAdapter } from "./stub-sap-inbound.adapter.js";
import { postInboundDelivery } from "./sap-delivery.client.js";
import { postInboundDeliveryPortaria } from "./sap-delivery.client.js";
import { postInboundMiro } from "./sap-miro.client.js";
import type { SapInboundDeliveryInput, SapInboundMiroInput } from "./sap-inbound.types.js";
import { matchPedidoLines } from "./sap-purchase-orders.match.js";
import {
  fetchPurchaseOrders,
  shouldUseMockPurchaseOrders,
} from "./sap-purchase-orders.client.js";

export type CpiSapInboundAdapterContext = SapInboundAdapterContext;

export class CpiSapInboundAdapter implements SapInboundAdapter {
  private readonly stub = new StubSapInboundAdapter();

  constructor(private readonly ctx: CpiSapInboundAdapterContext) {}

  private buildLogContext(
    operation: CpiIntegrationLogContext["operation"]
  ): CpiIntegrationLogContext | undefined {
    if (shouldUseMockPurchaseOrders(this.ctx.env)) return undefined;
    return {
      db: this.ctx.db,
      organizationId: this.ctx.organizationId,
      operation,
      nfeDocumentId: this.ctx.integrationLog?.nfeDocumentId,
      correlationId: this.ctx.integrationLog?.correlationId,
    };
  }

  async validatePurchaseOrderLines(input: {
    cnpj: string;
    lines: SapPedidoLineInput[];
    branchCnpj: string;
    issuedAt: Date;
  }): Promise<PedidoValidationResult> {
    const useMock = shouldUseMockPurchaseOrders(this.ctx.env);
    const integrationRow = await getOrganizationCpiIntegrationRow(
      this.ctx.db,
      this.ctx.organizationId
    );
    const credentials = useMock
      ? undefined
      : await getCpiCredentials(this.ctx.db, this.ctx.env, this.ctx.organizationId);

    const sapClient =
      credentials?.sapClient ?? integrationRow?.sapClient?.trim() ?? "310";
    const sapLanguage =
      credentials?.sapLanguage ?? integrationRow?.sapLanguage?.trim() ?? "PT";

    const response = await fetchPurchaseOrders({
      env: this.ctx.env,
      credentials,
      params: {
        issuerCnpj: input.cnpj,
        branchCnpj: input.branchCnpj,
        issuedAt: input.issuedAt,
        sapClient,
        sapLanguage,
      },
      logContext: this.buildLogContext("purchase_orders"),
    });

    const lines = matchPedidoLines(input.lines, response.PEDIDOSCOMPRA);

    return {
      allMatched: lines.length > 0 && lines.every((l) => l.matched),
      lines,
    };
  }

  async createInboundDelivery(input: SapInboundDeliveryInput): Promise<DeliveryResult> {
    if (shouldUseMockPurchaseOrders(this.ctx.env)) {
      return this.stub.createInboundDelivery(input);
    }

    const credentials = await getCpiCredentials(
      this.ctx.db,
      this.ctx.env,
      this.ctx.organizationId
    );
    return postInboundDelivery({
      env: this.ctx.env,
      credentials,
      input,
      logContext: this.buildLogContext("inbound_delivery"),
    });
  }

  async postInboundDeliveryPortaria(
    input: SapInboundDeliveryInput
  ): Promise<DeliveryPortariaResult> {
    if (shouldUseMockPurchaseOrders(this.ctx.env)) {
      return this.stub.postInboundDeliveryPortaria(input);
    }

    const credentials = await getCpiCredentials(
      this.ctx.db,
      this.ctx.env,
      this.ctx.organizationId
    );
    return postInboundDeliveryPortaria({
      env: this.ctx.env,
      credentials,
      input,
      logContext: this.buildLogContext("inbound_delivery"),
    });
  }

  async postGoodsMovementMigo(input: {
    deliveryNumber: string;
    fiscalYear?: string;
  }): Promise<MigoResult> {
    return this.stub.postGoodsMovementMigo(input);
  }

  async postInvoiceVerificationMiro(input: SapInboundMiroInput): Promise<MiroResult> {
    if (shouldUseMockPurchaseOrders(this.ctx.env)) {
      return this.stub.postInvoiceVerificationMiro(input);
    }
    const credentials = await getCpiCredentials(
      this.ctx.db,
      this.ctx.env,
      this.ctx.organizationId
    );
    return postInboundMiro({
      env: this.ctx.env,
      credentials,
      input: input as SapInboundMiroInput,
      logContext: this.buildLogContext("inbound_delivery"),
    });
  }
}
