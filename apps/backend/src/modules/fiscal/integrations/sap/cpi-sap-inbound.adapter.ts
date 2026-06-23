import type { CpiIntegrationLogContext } from '../cpi-http.client';
import {
  IntegrationRequestLogService,
} from '../integration-request-log.service';
import {
  SapIntegrationConfigService,
} from '../sap-integration-config.service';
import { postInboundDelivery, postInboundDeliveryPortaria } from './sap-delivery.client';
import type {
  DeliveryPortariaResult,
  DeliveryResult,
  MigoResult,
  MiroResult,
  PedidoValidationResult,
  SapInboundAdapter,
  SapInboundDeliveryInput,
  SapInboundMiroInput,
  SapPedidoLineInput,
} from './sap-inbound.types';
import { postInboundMiro } from './sap-miro.client';
import { matchPedidoLines } from './sap-purchase-orders.match';
import { fetchPurchaseOrders } from './sap-purchase-orders.client';
import type { SapPedidoCompraLine } from './sap-purchase-orders.types';
import type { SapInboundAdapterContext } from '../sap-inbound-adapter.service';
import type { StubSapInboundAdapter } from './stub-sap-inbound.adapter';

export class CpiSapInboundAdapter implements SapInboundAdapter {
  constructor(
    private readonly ctx: SapInboundAdapterContext,
    private readonly configService: SapIntegrationConfigService,
    private readonly logService: IntegrationRequestLogService,
    private readonly stub: StubSapInboundAdapter,
  ) {}

  private buildLogContext(
    operation: CpiIntegrationLogContext['operation'],
  ): CpiIntegrationLogContext | undefined {
    if (this.configService.shouldUseMock()) return undefined;
    return {
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
    const credentials = this.configService.shouldUseMock()
      ? undefined
      : await this.configService.getCredentials(this.ctx.organizationId);

    const sapClient =
      credentials?.sapClient ?? this.configService.getDefaultSapClient();
    const sapLanguage =
      credentials?.sapLanguage ?? this.configService.getDefaultSapLanguage();

    const response = await fetchPurchaseOrders({
      configService: this.configService,
      logService: this.logService,
      credentials,
      params: {
        issuerCnpj: input.cnpj,
        branchCnpj: input.branchCnpj,
        issuedAt: input.issuedAt,
        sapClient,
        sapLanguage,
      },
      logContext: this.buildLogContext('purchase_orders'),
    });

    const lines = matchPedidoLines(input.lines, response.PEDIDOSCOMPRA);
    return {
      allMatched: lines.length > 0 && lines.every((l) => l.matched),
      lines,
    };
  }

  async fetchPurchaseOrderLines(input: {
    cnpj: string;
    branchCnpj: string;
    issuedAt: Date;
  }): Promise<SapPedidoCompraLine[]> {
    const credentials = this.configService.shouldUseMock()
      ? undefined
      : await this.configService.getCredentials(this.ctx.organizationId);

    const sapClient =
      credentials?.sapClient ?? this.configService.getDefaultSapClient();
    const sapLanguage =
      credentials?.sapLanguage ?? this.configService.getDefaultSapLanguage();

    const response = await fetchPurchaseOrders({
      configService: this.configService,
      logService: this.logService,
      credentials,
      params: {
        issuerCnpj: input.cnpj,
        branchCnpj: input.branchCnpj,
        issuedAt: input.issuedAt,
        sapClient,
        sapLanguage,
      },
      logContext: this.buildLogContext('purchase_orders'),
    });

    return response.PEDIDOSCOMPRA;
  }

  async createInboundDelivery(
    input: SapInboundDeliveryInput,
  ): Promise<DeliveryResult> {
    if (this.configService.shouldUseMock()) {
      return this.stub.createInboundDelivery(input);
    }
    const credentials = await this.configService.getCredentials(
      this.ctx.organizationId,
    );
    return postInboundDelivery({
      configService: this.configService,
      logService: this.logService,
      credentials,
      input,
      logContext: this.buildLogContext('inbound_delivery'),
    });
  }

  async postInboundDeliveryPortaria(
    input: SapInboundDeliveryInput,
  ): Promise<DeliveryPortariaResult> {
    if (this.configService.shouldUseMock()) {
      return this.stub.postInboundDeliveryPortaria(input);
    }
    const credentials = await this.configService.getCredentials(
      this.ctx.organizationId,
    );
    return postInboundDeliveryPortaria({
      configService: this.configService,
      logService: this.logService,
      credentials,
      input,
      logContext: this.buildLogContext('inbound_delivery'),
    });
  }

  async postGoodsMovementMigo(input: {
    deliveryNumber: string;
    fiscalYear?: string;
  }): Promise<MigoResult> {
    return this.stub.postGoodsMovementMigo(input);
  }

  async postInvoiceVerificationMiro(
    input: SapInboundMiroInput,
  ): Promise<MiroResult> {
    if (this.configService.shouldUseMock()) {
      return this.stub.postInvoiceVerificationMiro(input);
    }
    const credentials = await this.configService.getCredentials(
      this.ctx.organizationId,
    );
    return postInboundMiro({
      configService: this.configService,
      logService: this.logService,
      credentials,
      input,
      logContext: this.buildLogContext('inbound_miro'),
    });
  }
}
