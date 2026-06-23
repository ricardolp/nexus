import { Injectable } from '@nestjs/common';
import type { CpiIntegrationLogContext } from './cpi-http.client';
import {
  IntegrationRequestLogService,
} from './integration-request-log.service';
import {
  SapIntegrationConfigService,
} from './sap-integration-config.service';
import { CpiSapInboundAdapter } from './sap/cpi-sap-inbound.adapter';
import type { SapInboundAdapter } from './sap/sap-inbound.types';
import { StubSapInboundAdapter } from './sap/stub-sap-inbound.adapter';

export type SapInboundAdapterContext = {
  organizationId: string;
  integrationLog?: {
    nfeDocumentId?: string;
    correlationId?: string;
  };
};

@Injectable()
export class SapInboundAdapterService {
  private readonly stub = new StubSapInboundAdapter();

  constructor(
    private readonly configService: SapIntegrationConfigService,
    private readonly logService: IntegrationRequestLogService,
  ) {}

  async canUseSapIntegration(organizationId: string): Promise<boolean> {
    return this.configService.isIntegrationConfigured(organizationId);
  }

  async getAdapter(ctx: SapInboundAdapterContext): Promise<SapInboundAdapter> {
    const canUse =
      this.configService.shouldUseMock() ||
      (await this.canUseSapIntegration(ctx.organizationId));
    if (canUse) {
      return new CpiSapInboundAdapter(
        ctx,
        this.configService,
        this.logService,
        this.stub,
      );
    }
    return this.stub;
  }

  getStubAdapter(): SapInboundAdapter {
    return this.stub;
  }

  buildLogContext(
    ctx: SapInboundAdapterContext,
    operation: CpiIntegrationLogContext['operation'],
  ): CpiIntegrationLogContext | undefined {
    if (this.configService.shouldUseMock()) return undefined;
    return {
      organizationId: ctx.organizationId,
      operation,
      nfeDocumentId: ctx.integrationLog?.nfeDocumentId,
      correlationId: ctx.integrationLog?.correlationId,
    };
  }
}
