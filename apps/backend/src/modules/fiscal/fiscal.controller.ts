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
import type { JwtPayload } from '@nexus/auth';
import type {
  FiscalDocumentDirection,
  FiscalNfeEnvironment,
  FiscalNfeEventType,
  FiscalNfseEnvironment,
  FiscalNfseEventType,
} from '@nexus/fiscal';
import { RequirePermission } from '../../shared/decorators/require-permission.decorator';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { OrganizationAccessGuard } from '../../shared/auth/organization-access.guard';
import { FiscalFacadeService } from './fiscal-facade.service';
import { NfeInboundService } from './nfe-inbound.service';

class CreateFiscalDocumentDto {
  direction!: FiscalDocumentDirection;
  companyId!: string;
  environment!: FiscalNfeEnvironment | FiscalNfseEnvironment;
  series!: number;
  number!: number;
  issuerCnpj!: string;
  model?: string;
}

class CreateFiscalDocumentEventDto {
  eventType!: FiscalNfeEventType | FiscalNfseEventType;
  sequence!: number;
}

class RegisterMigoDto {
  migoNumber?: string;
  migoItem?: string;
  fiscalYear?: string;
  accountingDocNumber?: string;
  useSapStub?: boolean;
}

class RejectInboundDto {
  reason!: string;
}

class RetrySapStepDto {
  step!: 'pedido' | 'delivery' | 'miro';
}

class ReprocessInboundDto {
  runInline?: boolean;
}

@Controller('organization')
export class FiscalController {
  constructor(
    private readonly fiscalFacade: FiscalFacadeService,
    private readonly nfeInboundService: NfeInboundService,
  ) {}

  @Get(':organizationId/documents/nfe/summary')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:read')
  getNfeDocumentsSummary(
    @Param('organizationId') organizationId: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.fiscalFacade.getNfeDocumentsSummary(organizationId, companyId);
  }

  @Get(':organizationId/documents/nfe')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:read')
  listNfeDocuments(
    @Param('organizationId') organizationId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
    @Query('direction') direction?: FiscalDocumentDirection,
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
    @Query('inboundStatus') inboundStatus?: string,
  ) {
    return this.fiscalFacade.listNfeDocuments(
      organizationId,
      Number(page),
      Number(perPage),
      direction,
      companyId,
      search,
      inboundStatus,
    );
  }

  @Post(':organizationId/documents/nfe')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:create')
  createNfeDocument(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateFiscalDocumentDto,
  ) {
    return this.fiscalFacade.createNfeDocumentRecord(organizationId, {
      direction: body.direction,
      companyId: body.companyId,
      environment: body.environment as FiscalNfeEnvironment,
      series: Number(body.series),
      number: Number(body.number),
      issuerCnpj: body.issuerCnpj,
      model: body.model,
    }    );
  }

  @Post(':organizationId/documents/nfe/import')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importNfeDocument(
    @Param('organizationId') organizationId: string,
    @UploadedFile() file: { buffer: Buffer; originalname?: string },
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file?.buffer) {
      throw new Error('XML file is required');
    }
    return this.nfeInboundService.importDocument({
      organizationId,
      companyId,
      xmlBuffer: file.buffer,
      fileName: file.originalname || 'import.xml',
      triggeredByUserId: user.sub,
    });
  }

  @Get(':organizationId/documents/nfe/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:read')
  getNfeDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfeDocument(organizationId, documentId);
  }

  @Patch(':organizationId/documents/nfe/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:update')
  updateNfeDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:delete')
  removeNfeDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.nfeInboundService.deleteDocumentCascade({
      organizationId,
      documentId,
    });
  }

  @Get(':organizationId/documents/nfe/:documentId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:events:read')
  listNfeDocumentEvents(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfeDocumentEvents(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/documents/nfe/:documentId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:events:create')
  createNfeDocumentEvent(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: CreateFiscalDocumentEventDto,
  ) {
    return this.fiscalFacade.createNfeDocumentEventRecord(
      organizationId,
      documentId,
      body.eventType as FiscalNfeEventType,
      Number(body.sequence),
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/events/:eventId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:events:read')
  getNfeDocumentEvent(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfeDocumentEvent(
      organizationId,
      documentId,
      eventId,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/items')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:items:read')
  listNfeDocumentItems(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfe/:documentId/items')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:items:create')
  createNfeDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentItemRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:items:read')
  getNfeDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.fiscalFacade.getNfeDocumentItem(
      organizationId,
      documentId,
      itemId,
    );
  }

  @Patch(':organizationId/documents/nfe/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:items:update')
  updateNfeDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeDocumentItemRecord(
      organizationId,
      documentId,
      itemId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:items:delete')
  removeNfeDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.fiscalFacade.removeNfeDocumentItem(
      organizationId,
      documentId,
      itemId,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/timeline')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:timeline:read')
  listNfeDocumentTimeline(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfe/:documentId/timeline')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:timeline:create')
  createNfeDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentTimelineRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:timeline:read')
  getNfeDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.fiscalFacade.getNfeDocumentTimelineEntry(
      organizationId,
      documentId,
      timelineId,
    );
  }

  @Patch(':organizationId/documents/nfe/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:timeline:update')
  updateNfeDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeDocumentTimelineRecord(
      organizationId,
      documentId,
      timelineId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:timeline:delete')
  removeNfeDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.fiscalFacade.removeNfeDocumentTimelineEntry(
      organizationId,
      documentId,
      timelineId,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/attachments')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:attachments:read')
  listNfeDocumentAttachments(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfe/:documentId/attachments')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:attachments:create')
  createNfeDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeDocumentAttachmentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:attachments:read')
  getNfeDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.fiscalFacade.getNfeDocumentAttachment(
      organizationId,
      documentId,
      attachmentId,
    );
  }

  @Patch(':organizationId/documents/nfe/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:attachments:update')
  updateNfeDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeDocumentAttachmentRecord(
      organizationId,
      documentId,
      attachmentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:attachments:delete')
  removeNfeDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.fiscalFacade.removeNfeDocumentAttachment(
      organizationId,
      documentId,
      attachmentId,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:read')
  getNfeInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfeInboundProcess(organizationId, documentId);
  }

  @Post(':organizationId/documents/nfe/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:create')
  createNfeInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Patch(':organizationId/documents/nfe/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  updateNfeInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:delete')
  removeNfeInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.removeNfeInboundProcess(organizationId, documentId);
  }

  @Post(':organizationId/documents/nfe/:documentId/confirm-portaria')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  confirmPortaria(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.confirmPortaria({
      organizationId,
      documentId,
      userId: user.sub,
    });
  }

  @Post(':organizationId/documents/nfe/:documentId/register-migo')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  registerMigo(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: RegisterMigoDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.registerMigo({
      organizationId,
      documentId,
      userId: user.sub,
      ...body,
    });
  }

  @Post(':organizationId/documents/nfe/:documentId/reject')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  rejectInbound(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: RejectInboundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.rejectInbound({
      organizationId,
      documentId,
      userId: user.sub,
      reason: body.reason,
    });
  }

  @Post(':organizationId/documents/nfe/:documentId/retry-sap-step')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  retrySapStep(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: RetrySapStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.retrySapStep({
      organizationId,
      documentId,
      step: body.step,
      userId: user.sub,
    });
  }

  @Post(':organizationId/documents/nfe/:documentId/reprocess-inbound')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  reprocessInbound(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: ReprocessInboundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.reprocessInbound({
      organizationId,
      documentId,
      userId: user.sub,
      runInline: body.runInline,
    });
  }

  @Post(':organizationId/documents/nfe/:documentId/reset-inbound')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:inbound-process:update')
  resetInbound(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.nfeInboundService.resetInboundDocument({
      organizationId,
      documentId,
      userId: user.sub,
    });
  }

  @Get(':organizationId/documents/nfe/:documentId/sap-documents')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:sap-documents:read')
  listNfeSapDocuments(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfe/:documentId/sap-documents')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:sap-documents:create')
  createNfeSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfeSapDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfe/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:sap-documents:read')
  getNfeSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
  ) {
    return this.fiscalFacade.getNfeSapDocument(
      organizationId,
      documentId,
      sapDocumentId,
    );
  }

  @Patch(':organizationId/documents/nfe/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:sap-documents:update')
  updateNfeSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfeSapDocumentRecord(
      organizationId,
      documentId,
      sapDocumentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfe/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfe:sap-documents:delete')
  removeNfeSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
  ) {
    return this.fiscalFacade.removeNfeSapDocument(
      organizationId,
      documentId,
      sapDocumentId,
    );
  }

  @Get(':organizationId/documents/nfse')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:read')
  listNfseDocuments(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfse')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:create')
  createNfseDocument(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateFiscalDocumentDto,
  ) {
    return this.fiscalFacade.createNfseDocumentRecord(organizationId, {
      direction: body.direction,
      companyId: body.companyId,
      environment: body.environment as FiscalNfseEnvironment,
      series: Number(body.series),
      number: Number(body.number),
      issuerCnpj: body.issuerCnpj,
      model: body.model,
    });
  }

  @Get(':organizationId/documents/nfse/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:read')
  getNfseDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfseDocument(organizationId, documentId);
  }

  @Patch(':organizationId/documents/nfse/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:update')
  updateNfseDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:delete')
  removeNfseDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.removeNfseDocument(organizationId, documentId);
  }

  @Get(':organizationId/documents/nfse/:documentId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:events:read')
  listNfseDocumentEvents(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    return this.fiscalFacade.listNfseDocumentEvents(
      organizationId,
      documentId,
      Number(page),
      Number(perPage),
    );
  }

  @Post(':organizationId/documents/nfse/:documentId/events')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:events:create')
  createNfseDocumentEvent(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: CreateFiscalDocumentEventDto,
  ) {
    return this.fiscalFacade.createNfseDocumentEventRecord(
      organizationId,
      documentId,
      body.eventType as FiscalNfseEventType,
      Number(body.sequence),
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/events/:eventId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:events:read')
  getNfseDocumentEvent(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('eventId') eventId: string,
  ) {
    return this.fiscalFacade.getNfseDocumentEvent(
      organizationId,
      documentId,
      eventId,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/items')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:items:read')
  listNfseDocumentItems(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfse/:documentId/items')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:items:create')
  createNfseDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentItemRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:items:read')
  getNfseDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.fiscalFacade.getNfseDocumentItem(
      organizationId,
      documentId,
      itemId,
    );
  }

  @Patch(':organizationId/documents/nfse/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:items:update')
  updateNfseDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseDocumentItemRecord(
      organizationId,
      documentId,
      itemId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId/items/:itemId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:items:delete')
  removeNfseDocumentItem(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.fiscalFacade.removeNfseDocumentItem(
      organizationId,
      documentId,
      itemId,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/timeline')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:timeline:read')
  listNfseDocumentTimeline(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfse/:documentId/timeline')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:timeline:create')
  createNfseDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentTimelineRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:timeline:read')
  getNfseDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.fiscalFacade.getNfseDocumentTimelineEntry(
      organizationId,
      documentId,
      timelineId,
    );
  }

  @Patch(':organizationId/documents/nfse/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:timeline:update')
  updateNfseDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseDocumentTimelineRecord(
      organizationId,
      documentId,
      timelineId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId/timeline/:timelineId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:timeline:delete')
  removeNfseDocumentTimeline(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('timelineId') timelineId: string,
  ) {
    return this.fiscalFacade.removeNfseDocumentTimelineEntry(
      organizationId,
      documentId,
      timelineId,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/attachments')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:attachments:read')
  listNfseDocumentAttachments(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfse/:documentId/attachments')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:attachments:create')
  createNfseDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseDocumentAttachmentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:attachments:read')
  getNfseDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.fiscalFacade.getNfseDocumentAttachment(
      organizationId,
      documentId,
      attachmentId,
    );
  }

  @Patch(':organizationId/documents/nfse/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:attachments:update')
  updateNfseDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseDocumentAttachmentRecord(
      organizationId,
      documentId,
      attachmentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId/attachments/:attachmentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:attachments:delete')
  removeNfseDocumentAttachment(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.fiscalFacade.removeNfseDocumentAttachment(
      organizationId,
      documentId,
      attachmentId,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:inbound-process:read')
  getNfseInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.getNfseInboundProcess(organizationId, documentId);
  }

  @Post(':organizationId/documents/nfse/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:inbound-process:create')
  createNfseInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Patch(':organizationId/documents/nfse/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:inbound-process:update')
  updateNfseInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseInboundProcessRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId/inbound-process')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:inbound-process:delete')
  removeNfseInboundProcess(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.fiscalFacade.removeNfseInboundProcess(organizationId, documentId);
  }

  @Get(':organizationId/documents/nfse/:documentId/sap-documents')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:sap-documents:read')
  listNfseSapDocuments(
    @Param('organizationId') organizationId: string,
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

  @Post(':organizationId/documents/nfse/:documentId/sap-documents')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:sap-documents:create')
  createNfseSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.createNfseSapDocumentRecord(
      organizationId,
      documentId,
      body,
    );
  }

  @Get(':organizationId/documents/nfse/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:sap-documents:read')
  getNfseSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
  ) {
    return this.fiscalFacade.getNfseSapDocument(
      organizationId,
      documentId,
      sapDocumentId,
    );
  }

  @Patch(':organizationId/documents/nfse/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:sap-documents:update')
  updateNfseSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.fiscalFacade.updateNfseSapDocumentRecord(
      organizationId,
      documentId,
      sapDocumentId,
      body,
    );
  }

  @Delete(':organizationId/documents/nfse/:documentId/sap-documents/:sapDocumentId')
  @UseGuards(OrganizationAccessGuard)
  @RequirePermission('organization:documents:nfse:sap-documents:delete')
  removeNfseSapDocument(
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
    @Param('sapDocumentId') sapDocumentId: string,
  ) {
    return this.fiscalFacade.removeNfseSapDocument(
      organizationId,
      documentId,
      sapDocumentId,
    );
  }
}
