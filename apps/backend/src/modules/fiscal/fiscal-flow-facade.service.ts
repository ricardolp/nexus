import { Injectable } from '@nestjs/common';
import {
  CreateFlowConfigDraft,
  DuplicateFlowConfig,
  GetFlowConfig,
  GetFlowConfigHistory,
  GetFlowInstanceByDocument,
  ListFlowConfigs,
  NfeFlowEngine,
  NfeFlowStep,
  PublishFlowConfig,
  SaveFlowConfigDraft,
  TestFlowConfig,
} from '@nexus/fiscal';
import { NotFoundError } from '@nexus/shared';
import {
  serializeNfeFlowAuditLog,
  serializeNfeFlowConfig,
  serializeNfeFlowConfigFull,
  serializeNfeFlowInstanceFull,
} from './fiscal-flow-facade.serializers';
import {
  PrismaNfeFlowAuditLogRepository,
  PrismaNfeFlowConfigRepository,
} from './nfe-flow-config.prisma';
import { PrismaNfeFlowInstanceRepository } from './nfe-flow-instance.prisma';
import { PrismaNfeInboundProcessRepository } from './nfe-inbound-process.prisma';
import { PrismaNfeDocumentRepository } from './nfe-document.prisma';
import {
  createRealFlowHandlers,
  RealCreateDeliveryHandler,
  RealCreateInvoiceHandler,
  RealFetchPurchaseOrdersHandler,
  RealPostMigoHandler,
  RealValidationsHandler,
  RealWaitGateStatusHandler,
} from './nfe-flow-real-handlers';
import { NfeInboundService } from './nfe-inbound.service';

@Injectable()
export class FiscalFlowFacadeService {
  private readonly flowEngine: NfeFlowEngine;

  constructor(
    private readonly flowConfigRepository: PrismaNfeFlowConfigRepository,
    private readonly flowAuditRepository: PrismaNfeFlowAuditLogRepository,
    private readonly flowInstanceRepository: PrismaNfeFlowInstanceRepository,
    private readonly inboundProcessRepository: PrismaNfeInboundProcessRepository,
    private readonly nfeDocumentRepository: PrismaNfeDocumentRepository,
    fetchPurchaseOrdersHandler: RealFetchPurchaseOrdersHandler,
    validationsHandler: RealValidationsHandler,
    createDeliveryHandler: RealCreateDeliveryHandler,
    waitGateHandler: RealWaitGateStatusHandler,
    postMigoHandler: RealPostMigoHandler,
    createInvoiceHandler: RealCreateInvoiceHandler,
  ) {
    this.flowEngine = new NfeFlowEngine(
      this.flowConfigRepository,
      this.flowInstanceRepository,
      this.inboundProcessRepository,
      createRealFlowHandlers({
        fetchPurchaseOrders: fetchPurchaseOrdersHandler,
        validations: validationsHandler,
        createDelivery: createDeliveryHandler,
        waitGate: waitGateHandler,
        postMigo: postMigoHandler,
        createInvoice: createInvoiceHandler,
      }),
    );
  }

  async listFlowConfigs(
    organizationId: string,
    companyId: string,
    model: string | undefined,
    page: number,
    perPage: number,
  ) {
    const result = await new ListFlowConfigs(this.flowConfigRepository).execute({
      organizationId,
      companyId,
      model,
      page,
      perPage,
    });
    return {
      ...result,
      items: result.items.map(serializeNfeFlowConfig),
    };
  }

  async createFlowConfigDraft(
    organizationId: string,
    companyId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const full = await new CreateFlowConfigDraft(
      this.flowConfigRepository,
    ).execute({
      organizationId,
      companyId,
      model: (body.model as string) ?? '55',
      name: body.name as string | undefined,
      userId,
      seedDefault: body.seedDefault !== false,
    });
    return serializeNfeFlowConfigFull(full);
  }

  async getFlowConfig(configId: string) {
    const full = await new GetFlowConfig(this.flowConfigRepository).execute({
      configId,
    });
    return serializeNfeFlowConfigFull(full);
  }

  async saveFlowConfigDraft(
    configId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const full = await new SaveFlowConfigDraft(
      this.flowConfigRepository,
    ).execute({
      configId,
      userId,
      active: body.active as boolean | undefined,
      name: body.name as string | undefined,
      steps: (body.steps as Array<{
        id?: string;
        stepKey: string;
        name: string;
        sequence: number;
        active: boolean;
        type: NfeFlowStep['type'];
        config: Record<string, unknown>;
        positionX: number;
        positionY: number;
      }>) ?? [],
      edges: (body.edges as Array<{
        id?: string;
        sourceStepId: string;
        targetStepId: string;
        conditionType: import('@nexus/fiscal').NfeFlowEdge['conditionType'];
        conditionExpression?: Record<string, unknown> | null;
      }>) ?? [],
    });
    return serializeNfeFlowConfigFull(full);
  }

  async publishFlowConfig(
    configId: string,
    body: Record<string, unknown>,
    userId?: string,
  ) {
    const full = await new PublishFlowConfig(
      this.flowConfigRepository,
      this.flowAuditRepository,
    ).execute({
      configId,
      userId,
      reason: (body.reason as string) ?? null,
    });
    return serializeNfeFlowConfigFull(full);
  }

  async duplicateFlowConfig(configId: string, userId?: string) {
    const full = await new DuplicateFlowConfig(
      this.flowConfigRepository,
    ).execute({ configId, userId });
    return serializeNfeFlowConfigFull(full);
  }

  async testFlowConfig(configId: string, body: Record<string, unknown>) {
    return new TestFlowConfig(this.flowConfigRepository).execute({
      configId,
      accessKey: body.accessKey as string | undefined,
      purchaseOrder: body.purchaseOrder as string | undefined,
    });
  }

  async getFlowConfigHistory(configId: string, page: number, perPage: number) {
    const result = await new GetFlowConfigHistory(
      this.flowAuditRepository,
    ).execute({ flowConfigId: configId, page, perPage });
    return {
      ...result,
      items: result.items.map(serializeNfeFlowAuditLog),
    };
  }

  async getFlowInstanceByDocument(documentId: string) {
    const full = await new GetFlowInstanceByDocument(
      this.flowInstanceRepository,
    ).execute({ documentId });
    return serializeNfeFlowInstanceFull(full);
  }

  async startFlowForDocument(
    organizationId: string,
    companyId: string,
    documentId: string,
    model: string,
  ) {
    const instance = await this.flowEngine.startForDocument({
      organizationId,
      companyId,
      documentId,
      model,
    });
    const full = await this.flowInstanceRepository.findFullById(instance.id);
    if (!full) {
      throw new NotFoundError('Instância de fluxo não encontrada.');
    }
    return serializeNfeFlowInstanceFull(full);
  }

  async tryStartFlowForInboundDocument(documentId: string) {
    const document = await this.nfeDocumentRepository.findById(documentId);
    if (!document) return null;
    try {
      return await this.startFlowForDocument(
        document.organizationId,
        document.companyId,
        documentId,
        document.model,
      );
    } catch {
      return null;
    }
  }
}
