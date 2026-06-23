import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '../../db/db.module';
import { EventDispatchModule } from '../integration/event-dispatch.module';
import { FiscalController } from './fiscal.controller';
import { FiscalFacadeService } from './fiscal-facade.service';
import { FiscalFlowConfigController } from './fiscal-flow-config.controller';
import { FiscalFlowFacadeService } from './fiscal-flow-facade.service';
import { FiscalNumberRangeController } from './number-range.controller';
import { IntegrationRequestLogService } from './integrations/integration-request-log.service';
import { SapInboundAdapterService } from './integrations/sap-inbound-adapter.service';
import { SapIntegrationConfigService } from './integrations/sap-integration-config.service';
import { NfeInboundProcessor } from './nfe-inbound.processor';
import { NfeInboundQueueService } from './nfe-inbound-queue.service';
import { NFE_INBOUND_QUEUE } from './nfe-inbound.queue';
import {
  RealCreateDeliveryHandler,
  RealCreateInvoiceHandler,
  RealFetchPurchaseOrdersHandler,
  RealPostMigoHandler,
  RealValidationsHandler,
  RealWaitGateStatusHandler,
} from './nfe-flow-real-handlers';
import { NfeInboundService } from './nfe-inbound.service';
import { PrismaNfeDocumentAttachmentRepository } from './nfe-document-attachment.prisma';
import { PrismaNfeDocumentEventRepository } from './nfe-document-event.prisma';
import { PrismaNfeDocumentItemRepository } from './nfe-document-item.prisma';
import { PrismaNfeDocumentTimelineRepository } from './nfe-document-timeline.prisma';
import { PrismaNfeDocumentRepository } from './nfe-document.prisma';
import { PrismaNfeInboundProcessRepository } from './nfe-inbound-process.prisma';
import { PrismaNfeNumberRangeEventRepository } from './nfe-number-range-event.prisma';
import { PrismaNfeNumberRangeRepository } from './nfe-number-range.prisma';
import { PrismaNfeSapDocumentRepository } from './nfe-sap-document.prisma';
import { PrismaNfeFlowInstanceRepository } from './nfe-flow-instance.prisma';
import {
  PrismaNfeFlowAuditLogRepository,
  PrismaNfeFlowConfigRepository,
} from './nfe-flow-config.prisma';
import { PrismaNfseDocumentAttachmentRepository } from './nfse-document-attachment.prisma';
import { PrismaNfseDocumentEventRepository } from './nfse-document-event.prisma';
import { PrismaNfseDocumentItemRepository } from './nfse-document-item.prisma';
import { PrismaNfseDocumentTimelineRepository } from './nfse-document-timeline.prisma';
import { PrismaNfseDocumentRepository } from './nfse-document.prisma';
import { PrismaNfseInboundProcessRepository } from './nfse-inbound-process.prisma';
import { PrismaNfseNumberRangeEventRepository } from './nfse-number-range-event.prisma';
import { PrismaNfseNumberRangeRepository } from './nfse-number-range.prisma';
import { PrismaNfseSapDocumentRepository } from './nfse-sap-document.prisma';

@Module({
  imports: [
    DbModule,
    EventDispatchModule,
    BullModule.registerQueue({ name: NFE_INBOUND_QUEUE }),
  ],
  controllers: [FiscalController, FiscalNumberRangeController, FiscalFlowConfigController],
  providers: [
    PrismaNfeDocumentRepository,
    PrismaNfseDocumentRepository,
    PrismaNfeDocumentEventRepository,
    PrismaNfseDocumentEventRepository,
    PrismaNfeDocumentTimelineRepository,
    PrismaNfseDocumentTimelineRepository,
    PrismaNfeDocumentAttachmentRepository,
    PrismaNfseDocumentAttachmentRepository,
    PrismaNfeNumberRangeRepository,
    PrismaNfseNumberRangeRepository,
    PrismaNfeNumberRangeEventRepository,
    PrismaNfseNumberRangeEventRepository,
    PrismaNfeDocumentItemRepository,
    PrismaNfseDocumentItemRepository,
    PrismaNfeInboundProcessRepository,
    PrismaNfseInboundProcessRepository,
    PrismaNfeSapDocumentRepository,
    PrismaNfseSapDocumentRepository,
    PrismaNfeFlowConfigRepository,
    PrismaNfeFlowAuditLogRepository,
    PrismaNfeFlowInstanceRepository,
    SapIntegrationConfigService,
    IntegrationRequestLogService,
    SapInboundAdapterService,
    NfeInboundService,
    NfeInboundQueueService,
    NfeInboundProcessor,
    RealCreateDeliveryHandler,
    RealCreateInvoiceHandler,
    RealFetchPurchaseOrdersHandler,
    RealPostMigoHandler,
    RealValidationsHandler,
    RealWaitGateStatusHandler,
    FiscalFacadeService,
    FiscalFlowFacadeService,
  ],
  exports: [FiscalFacadeService, FiscalFlowFacadeService, NfeInboundService],
})
export class FiscalModule implements OnModuleInit {
  constructor(
    private readonly inboundService: NfeInboundService,
    private readonly inboundQueueService: NfeInboundQueueService,
  ) {}

  onModuleInit(): void {
    this.inboundService.setQueueService(this.inboundQueueService);
  }
}
