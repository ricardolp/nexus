import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type {
  FiscalDocumentDirection,
  FiscalNfeEnvironment,
  FiscalNfeEventType,
  FiscalNfseEnvironment,
  FiscalNfseEventType,
} from '@nexus/fiscal';
import { CurrentIntegration } from '../../shared/decorators/current-integration.decorator';
import { IntegrationRoute } from '../../shared/decorators/integration-route.decorator';
import { IntegrationAuthGuard } from '../../shared/auth/integration-auth.guard';
import { FiscalFacadeService } from '../fiscal/fiscal-facade.service';
import { NfeInboundService } from '../fiscal/nfe-inbound.service';

class EmitDocumentDto {
  companyId!: string;
  issuerCnpj!: string;
  direction?: FiscalDocumentDirection;
  environment?: FiscalNfeEnvironment | FiscalNfseEnvironment;
  series?: number;
  number?: number;
}

class CreateDocumentEventDto {
  eventType!: FiscalNfeEventType | FiscalNfseEventType;
  sequence!: number;
}

@Controller('integration/v1')
@UseGuards(IntegrationAuthGuard)
export class IntegrationFiscalController {
  constructor(
    private readonly fiscalFacade: FiscalFacadeService,
    private readonly nfeInboundService: NfeInboundService,
  ) {}

  @Post('documents/nfe/import')
  @IntegrationRoute('integration:documents:nfe:emit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importNfe(
    @CurrentIntegration('organizationId') organizationId: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string },
    @Query('companyId') companyId: string | undefined,
  ) {
    if (!file?.buffer) {
      throw new Error('XML file is required');
    }
    return this.nfeInboundService.importDocument({
      organizationId,
      companyId,
      xmlBuffer: file.buffer,
      fileName: file.originalname || 'import.xml',
    });
  }

  @Post('documents/nfe')
  @IntegrationRoute('integration:documents:nfe:emit')
  emitNfe(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Body() body: EmitDocumentDto,
  ) {
    return this.fiscalFacade.emitNfeDocument(
      organizationId,
      body.companyId,
      body.issuerCnpj,
      body.direction,
      body.environment as FiscalNfeEnvironment | undefined,
      body.series,
      body.number,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('documents/nfe')
  @IntegrationRoute('integration:documents:nfe:consult')
  listNfe(
    @CurrentIntegration('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
    @Query('direction') direction?: FiscalDocumentDirection,
    @Query('companyId') companyId?: string,
  ) {
    return this.fiscalFacade.listNfeDocuments(
      organizationId,
      Number(page),
      Number(perPage),
      direction,
      companyId,
    );
  }

  @Get('documents/nfe/:documentId')
  @IntegrationRoute('integration:documents:nfe:consult')
  consultNfe(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.consultNfeDocument(organizationId, documentId);
  }

  @Post('documents/nfe/:documentId/events')
  @IntegrationRoute('integration:documents:nfe:events:emit')
  createNfeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('documentId') documentId: string,
    @Body() body: CreateDocumentEventDto,
  ) {
    return this.fiscalFacade.createNfeDocumentEventRecord(
      organizationId,
      documentId,
      body.eventType as FiscalNfeEventType,
      Number(body.sequence),
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('documents/nfe/:documentId/events/:eventId')
  @IntegrationRoute('integration:documents:nfe:events:consult')
  getNfeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfeDocumentEvent(
      organizationId,
      documentId,
      eventId,
    );
  }

  @Get('documents/nfe/:documentId/items')
  @IntegrationRoute('integration:documents:nfe:items:consult')
  listNfeItems(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeDocumentItems(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfe/:documentId/items')
  @IntegrationRoute('integration:documents:nfe:items:emit')
  createNfeItem(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentItemRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfe/:documentId/timeline')
  @IntegrationRoute('integration:documents:nfe:timeline:consult')
  listNfeTimeline(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeDocumentTimeline(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfe/:documentId/timeline')
  @IntegrationRoute('integration:documents:nfe:timeline:emit')
  createNfeTimeline(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentTimelineRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfe/:documentId/attachments')
  @IntegrationRoute('integration:documents:nfe:attachments:consult')
  listNfeAttachments(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeDocumentAttachments(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfe/:documentId/attachments')
  @IntegrationRoute('integration:documents:nfe:attachments:emit')
  createNfeAttachment(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentAttachmentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfe/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfe:inbound-process:consult')
  getNfeInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfeInboundProcess(organizationId, documentId);
  }

  @Post('documents/nfe/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfe:inbound-process:emit')
  createNfeInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Patch('documents/nfe/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfe:inbound-process:emit')
  updateNfeInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfe/:documentId/sap-documents')
  @IntegrationRoute('integration:documents:nfe:sap-documents:consult')
  listNfeSapDocuments(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeSapDocuments(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfe/:documentId/sap-documents')
  @IntegrationRoute('integration:documents:nfe:sap-documents:emit')
  createNfeSapDocument(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeSapDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Post('companies/:companyId/number-ranges/nfe')
  @IntegrationRoute('integration:companies:number-ranges:nfe:emit')
  createNfeNumberRange(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeNumberRangeRecord(
      organizationId,
      companyId,
      body,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('companies/:companyId/number-ranges/nfe/:rangeId')
  @IntegrationRoute('integration:companies:number-ranges:nfe:consult')
  getNfeNumberRange(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.getNfeNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Post('companies/:companyId/number-ranges/nfe/:rangeId/events')
  @IntegrationRoute('integration:companies:number-ranges:nfe:events:emit')
  createNfeNumberRangeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeNumberRangeEventRecord(
      organizationId,
      companyId,
      rangeId,
      body,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('companies/:companyId/number-ranges/nfe/:rangeId/events/:eventId')
  @IntegrationRoute('integration:companies:number-ranges:nfe:events:consult')
  getNfeNumberRangeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfeNumberRangeEvent(
      organizationId,
      companyId,
      rangeId,
      eventId,
    );
  }

  @Post('documents/nfse')
  @IntegrationRoute('integration:documents:nfse:emit')
  emitNfse(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Body() body: EmitDocumentDto,
  ) {
    return this.fiscalFacade.emitNfseDocument(
      organizationId,
      body.companyId,
      body.issuerCnpj,
      body.direction,
      body.environment as FiscalNfseEnvironment | undefined,
      body.series,
      body.number,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('documents/nfse')
  @IntegrationRoute('integration:documents:nfse:consult')
  listNfse(
    @CurrentIntegration('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
    @Query('direction') direction?: FiscalDocumentDirection,
    @Query('companyId') companyId?: string,
  ) {
    return this.fiscalFacade.listNfseDocuments(
      organizationId,
      Number(page),
      Number(perPage),
      direction,
      companyId,
    );
  }

  @Get('documents/nfse/:documentId')
  @IntegrationRoute('integration:documents:nfse:consult')
  consultNfse(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.consultNfseDocument(organizationId, documentId);
  }

  @Post('documents/nfse/:documentId/events')
  @IntegrationRoute('integration:documents:nfse:events:emit')
  createNfseEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('documentId') documentId: string,
    @Body() body: CreateDocumentEventDto,
  ) {
    return this.fiscalFacade.createNfseDocumentEventRecord(
      organizationId,
      documentId,
      body.eventType as FiscalNfseEventType,
      Number(body.sequence),
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('documents/nfse/:documentId/events/:eventId')
  @IntegrationRoute('integration:documents:nfse:events:consult')
  getNfseEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfseDocumentEvent(
      organizationId,
      documentId,
      eventId,
    );
  }

  @Get('documents/nfse/:documentId/items')
  @IntegrationRoute('integration:documents:nfse:items:consult')
  listNfseItems(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseDocumentItems(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfse/:documentId/items')
  @IntegrationRoute('integration:documents:nfse:items:emit')
  createNfseItem(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentItemRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfse/:documentId/timeline')
  @IntegrationRoute('integration:documents:nfse:timeline:consult')
  listNfseTimeline(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseDocumentTimeline(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfse/:documentId/timeline')
  @IntegrationRoute('integration:documents:nfse:timeline:emit')
  createNfseTimeline(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentTimelineRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfse/:documentId/attachments')
  @IntegrationRoute('integration:documents:nfse:attachments:consult')
  listNfseAttachments(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseDocumentAttachments(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfse/:documentId/attachments')
  @IntegrationRoute('integration:documents:nfse:attachments:emit')
  createNfseAttachment(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentAttachmentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfse/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfse:inbound-process:consult')
  getNfseInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfseInboundProcess(organizationId, documentId);
  }

  @Post('documents/nfse/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfse:inbound-process:emit')
  createNfseInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Patch('documents/nfse/:documentId/inbound-process')
  @IntegrationRoute('integration:documents:nfse:inbound-process:emit')
  updateNfseInboundProcess(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get('documents/nfse/:documentId/sap-documents')
  @IntegrationRoute('integration:documents:nfse:sap-documents:consult')
  listNfseSapDocuments(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseSapDocuments(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post('documents/nfse/:documentId/sap-documents')
  @IntegrationRoute('integration:documents:nfse:sap-documents:emit')
  createNfseSapDocument(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseSapDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Post('companies/:companyId/number-ranges/nfse')
  @IntegrationRoute('integration:companies:number-ranges:nfse:emit')
  createNfseNumberRange(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseNumberRangeRecord(
      organizationId,
      companyId,
      body,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('companies/:companyId/number-ranges/nfse/:rangeId')
  @IntegrationRoute('integration:companies:number-ranges:nfse:consult')
  getNfseNumberRange(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
  ) {
    return this.fiscalFacade.getNfseNumberRange(
      organizationId,
      companyId,
      rangeId,
    );
  }

  @Post('companies/:companyId/number-ranges/nfse/:rangeId/events')
  @IntegrationRoute('integration:companies:number-ranges:nfse:events:emit')
  createNfseNumberRangeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @CurrentIntegration('tokenId') integrationTokenId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseNumberRangeEventRecord(
      organizationId,
      companyId,
      rangeId,
      body,
      { source: 'integration', integrationTokenId },
    );
  }

  @Get('companies/:companyId/number-ranges/nfse/:rangeId/events/:eventId')
  @IntegrationRoute('integration:companies:number-ranges:nfse:events:consult')
  getNfseNumberRangeEvent(
    @CurrentIntegration('organizationId') organizationId: string,
    @Param('companyId') companyId: string,
    @Param('rangeId') rangeId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfseNumberRangeEvent(
      organizationId,
      companyId,
      rangeId,
      eventId,
    );
  }
}
