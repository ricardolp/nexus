import { Injectable } from '@nestjs/common';
import {
  ConsultNfeDocument,
  ConsultNfseDocument,
  CreateNfeDocument,
  CreateNfeDocumentEvent,
  DeleteNfeDocument,
  DeleteNfseDocument,
  EmitNfeDocument,
  EmitNfseDocument,
  FindNfeDocumentById,
  FindNfeDocumentEventById,
  FindNfeDocumentEventPage,
  FindNfeDocumentPage,
  FindNfseDocumentById,
  FindNfseDocumentEventById,
  FindNfseDocumentEventPage,
  FindNfseDocumentPage,
  FiscalDocumentDirection,
  FiscalNfeAttachmentKind,
  FiscalNfeEnvironment,
  FiscalNfeEventStatus,
  FiscalNfeEventType,
  FiscalNfeInboundStatus,
  FiscalNfeNumberRangeEventType,
  FiscalNfePedidoValidationStatus,
  FiscalNfeSapDocumentStatus,
  FiscalNfeSapDocumentType,
  FiscalNfeTimelineSource,
  FiscalNfseAttachmentKind,
  FiscalNfseEnvironment,
  FiscalNfseEventStatus,
  FiscalNfseEventType,
  FiscalNfseInboundStatus,
  FiscalNfseNumberRangeEventType,
  FiscalNfsePedidoValidationStatus,
  FiscalNfseSapDocumentStatus,
  FiscalNfseSapDocumentType,
  FiscalNfseTimelineSource,
  NfeDocument,
  NfeDocumentAttachment,
  NfeDocumentItem,
  NfeDocumentTimeline,
  NfeInboundProcess,
  NfeNumberRange,
  NfeNumberRangeEvent,
  NfeSapDocument,
  NfseDocument,
  NfseDocumentAttachment,
  NfseDocumentEvent,
  NfseDocumentItem,
  NfseDocumentTimeline,
  NfseInboundProcess,
  NfseNumberRange,
  NfseNumberRangeEvent,
  NfseSapDocument,
  UpdateNfeDocument,
  UpdateNfseDocument,
  parseNfeXmlDetail,
} from '@nexus/fiscal';
import { NotFoundError, WebhookEventType } from '@nexus/shared';
import { DomainEventPublisherService } from '../integration/domain-event-publisher.service';
import { NfeInboundService } from './nfe-inbound.service';
import {
  CreateNfeDocumentInput,
  CreateNfseDocumentInput,
  FiscalOperationContext,
  serializeNfeDocument,
  serializeNfeDocumentListItem,
  serializeNfeDocumentAttachment,
  serializeNfeDocumentEvent,
  serializeNfeDocumentEventWithDocument,
  serializeNfeDocumentItem,
  serializeNfeDocumentTimeline,
  serializeNfeInboundProcess,
  serializeNfeNumberRange,
  serializeNfeNumberRangeEvent,
  serializeNfeSapDocument,
  serializeNfseDocument,
  serializeNfseDocumentAttachment,
  serializeNfseDocumentEvent,
  serializeNfseDocumentItem,
  serializeNfseDocumentTimeline,
  serializeNfseInboundProcess,
  serializeNfseNumberRange,
  serializeNfseNumberRangeEvent,
  serializeNfseSapDocument,
} from './fiscal-facade.serializers';
import { PrismaNfeDocumentAttachmentRepository } from './nfe-document-attachment.prisma';
import { PrismaNfeDocumentEventRepository } from './nfe-document-event.prisma';
import { PrismaNfeDocumentItemRepository } from './nfe-document-item.prisma';
import { PrismaNfeDocumentTimelineRepository } from './nfe-document-timeline.prisma';
import { PrismaNfeDocumentRepository } from './nfe-document.prisma';
import { PrismaNfeInboundProcessRepository } from './nfe-inbound-process.prisma';
import { PrismaNfeNumberRangeEventRepository } from './nfe-number-range-event.prisma';
import { PrismaNfeNumberRangeRepository } from './nfe-number-range.prisma';
import { PrismaNfeSapDocumentRepository } from './nfe-sap-document.prisma';
import { PrismaNfseDocumentAttachmentRepository } from './nfse-document-attachment.prisma';
import { PrismaNfseDocumentEventRepository } from './nfse-document-event.prisma';
import { PrismaNfseDocumentItemRepository } from './nfse-document-item.prisma';
import { PrismaNfseDocumentTimelineRepository } from './nfse-document-timeline.prisma';
import { PrismaNfseDocumentRepository } from './nfse-document.prisma';
import { PrismaNfseInboundProcessRepository } from './nfse-inbound-process.prisma';
import { PrismaNfseNumberRangeEventRepository } from './nfse-number-range-event.prisma';
import { PrismaNfseNumberRangeRepository } from './nfse-number-range.prisma';
import { PrismaNfseSapDocumentRepository } from './nfse-sap-document.prisma';
import { FiscalFlowFacadeService } from './fiscal-flow-facade.service';

@Injectable()
export class FiscalFacadeService {
  private readonly createNfeDocument: CreateNfeDocument;
  private readonly findNfeDocumentPage: FindNfeDocumentPage;
  private readonly findNfeDocumentById: FindNfeDocumentById;
  private readonly updateNfeDocument: UpdateNfeDocument;
  private readonly deleteNfeDocument: DeleteNfeDocument;
  private readonly findNfseDocumentPage: FindNfseDocumentPage;
  private readonly findNfseDocumentById: FindNfseDocumentById;
  private readonly updateNfseDocument: UpdateNfseDocument;
  private readonly deleteNfseDocument: DeleteNfseDocument;
  private readonly createNfeDocumentEvent: CreateNfeDocumentEvent;
  private readonly findNfeDocumentEventPage: FindNfeDocumentEventPage;
  private readonly findNfeDocumentEventById: FindNfeDocumentEventById;
  private readonly findNfseDocumentEventPage: FindNfseDocumentEventPage;
  private readonly findNfseDocumentEventById: FindNfseDocumentEventById;
  private readonly emitNfeDocumentUseCase: EmitNfeDocument;
  private readonly emitNfseDocumentUseCase: EmitNfseDocument;
  private readonly consultNfeDocumentUseCase: ConsultNfeDocument;
  private readonly consultNfseDocumentUseCase: ConsultNfseDocument;

  constructor(
    private readonly nfeDocumentRepository: PrismaNfeDocumentRepository,
    private readonly nfseDocumentRepository: PrismaNfseDocumentRepository,
    private readonly nfeDocumentEventRepository: PrismaNfeDocumentEventRepository,
    private readonly nfseDocumentEventRepository: PrismaNfseDocumentEventRepository,
    private readonly nfeDocumentTimelineRepository: PrismaNfeDocumentTimelineRepository,
    private readonly nfseDocumentTimelineRepository: PrismaNfseDocumentTimelineRepository,
    private readonly nfeDocumentAttachmentRepository: PrismaNfeDocumentAttachmentRepository,
    private readonly nfseDocumentAttachmentRepository: PrismaNfseDocumentAttachmentRepository,
    private readonly nfeNumberRangeRepository: PrismaNfeNumberRangeRepository,
    private readonly nfseNumberRangeRepository: PrismaNfseNumberRangeRepository,
    private readonly nfeNumberRangeEventRepository: PrismaNfeNumberRangeEventRepository,
    private readonly nfseNumberRangeEventRepository: PrismaNfseNumberRangeEventRepository,
    private readonly nfeDocumentItemRepository: PrismaNfeDocumentItemRepository,
    private readonly nfseDocumentItemRepository: PrismaNfseDocumentItemRepository,
    private readonly nfeInboundProcessRepository: PrismaNfeInboundProcessRepository,
    private readonly nfseInboundProcessRepository: PrismaNfseInboundProcessRepository,
    private readonly nfeSapDocumentRepository: PrismaNfeSapDocumentRepository,
    private readonly nfseSapDocumentRepository: PrismaNfseSapDocumentRepository,
    private readonly domainEventPublisher: DomainEventPublisherService,
    private readonly fiscalFlowFacade: FiscalFlowFacadeService,
    private readonly nfeInboundService: NfeInboundService,
  ) {
    this.createNfeDocument = new CreateNfeDocument(nfeDocumentRepository);
    this.findNfeDocumentPage = new FindNfeDocumentPage(nfeDocumentRepository);
    this.findNfeDocumentById = new FindNfeDocumentById(nfeDocumentRepository);
    this.updateNfeDocument = new UpdateNfeDocument(nfeDocumentRepository);
    this.deleteNfeDocument = new DeleteNfeDocument(nfeDocumentRepository);
    this.findNfseDocumentPage = new FindNfseDocumentPage(nfseDocumentRepository);
    this.findNfseDocumentById = new FindNfseDocumentById(nfseDocumentRepository);
    this.updateNfseDocument = new UpdateNfseDocument(nfseDocumentRepository);
    this.deleteNfseDocument = new DeleteNfseDocument(nfseDocumentRepository);
    this.createNfeDocumentEvent = new CreateNfeDocumentEvent(nfeDocumentEventRepository);
    this.findNfeDocumentEventPage = new FindNfeDocumentEventPage(nfeDocumentEventRepository);
    this.findNfeDocumentEventById = new FindNfeDocumentEventById(nfeDocumentEventRepository);
    this.findNfseDocumentEventPage = new FindNfseDocumentEventPage(nfseDocumentEventRepository);
    this.findNfseDocumentEventById = new FindNfseDocumentEventById(nfseDocumentEventRepository);
    this.emitNfeDocumentUseCase = new EmitNfeDocument(nfeDocumentRepository);
    this.emitNfseDocumentUseCase = new EmitNfseDocument(nfseDocumentRepository);
    this.consultNfeDocumentUseCase = new ConsultNfeDocument(nfeDocumentRepository);
    this.consultNfseDocumentUseCase = new ConsultNfseDocument(nfseDocumentRepository);
  }

  async emitNfeDocument(
    organizationId: string,
    companyId: string,
    issuerCnpj: string,
    direction?: FiscalDocumentDirection,
    environment?: FiscalNfeEnvironment,
    series?: number,
    number?: number,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const document = await this.emitNfeDocumentUseCase.execute({
      organizationId,
      companyId,
      issuerCnpj,
      direction,
      environment,
      series,
      number,
    });

    await this.publishDocumentEvent('nfe', 'nfe.document.sent_to_sefaz', document, context);
    await this.publishDocumentEvent('nfe', 'nfe.document.authorized', document, context);

    return serializeNfeDocument(document);
  }

  async consultNfeDocument(organizationId: string, documentId: string) {
    const document = await this.consultNfeDocumentUseCase.execute({
      id: documentId,
      organizationId,
    });
    return serializeNfeDocument(document);
  }

  async emitNfseDocument(
    organizationId: string,
    companyId: string,
    issuerCnpj: string,
    direction?: FiscalDocumentDirection,
    environment?: FiscalNfseEnvironment,
    series?: number,
    number?: number,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const document = await this.emitNfseDocumentUseCase.execute({
      organizationId,
      companyId,
      issuerCnpj,
      direction,
      environment,
      series,
      number,
    });

    await this.publishDocumentEvent('nfse', 'nfse.document.sent_to_prefeitura', document, context);
    await this.publishDocumentEvent('nfse', 'nfse.document.authorized', document, context);

    return serializeNfseDocument(document);
  }

  async consultNfseDocument(organizationId: string, documentId: string) {
    const document = await this.consultNfseDocumentUseCase.execute({
      id: documentId,
      organizationId,
    });
    return serializeNfseDocument(document);
  }

  async listNfeDocuments(
    organizationId: string,
    page: number,
    perPage: number,
    direction?: FiscalDocumentDirection,
    companyId?: string,
    search?: string,
    inboundStatus?: string,
  ) {
    const result = await this.nfeDocumentRepository.findPageWithInbound({
      organizationId,
      companyId,
      direction,
      search,
      inboundStatus,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map((item) =>
        serializeNfeDocumentListItem(item.document, item.inboundProcess),
      ),
    };
  }

  async getNfeDocumentsSummary(organizationId: string, companyId?: string) {
    return this.nfeDocumentRepository.getSummary(organizationId, companyId);
  }

  async createNfeDocumentRecord(
    organizationId: string,
    input: CreateNfeDocumentInput,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const document = await this.createNfeDocument.execute({
      organizationId,
      companyId: input.companyId,
      direction: input.direction,
      environment: input.environment,
      series: input.series,
      number: input.number,
      issuerCnpj: input.issuerCnpj,
      model: input.model,
    });

    await this.publishDocumentEvent('nfe', 'nfe.document.created', document, context);

    return serializeNfeDocument(document);
  }

  async getNfeDocument(organizationId: string, documentId: string) {
    const document = await this.findNfeDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(document, organizationId, 'Documento NFe');
    const serialized = serializeNfeDocument(document);
    if (serialized.issuerName?.trim()) {
      return serialized;
    }
    const issuerName = await this.resolveIssuerNameFromXml(documentId);
    return { ...serialized, issuerName };
  }

  private async resolveIssuerNameFromXml(
    documentId: string,
  ): Promise<string | null> {
    const attachments =
      await this.nfeDocumentAttachmentRepository.findByDocumentId(documentId);
    const xmlAttachment = attachments.find((a) => a.content?.trim());
    if (!xmlAttachment?.content) return null;

    try {
      const parsed = parseNfeXmlDetail(Buffer.from(xmlAttachment.content, 'utf8'));
      const name = parsed.emitente.razaoSocial?.trim();
      return name && name !== 'Não informado' ? name : null;
    } catch {
      return null;
    }
  }

  async updateNfeDocumentRecord(
    organizationId: string,
    documentId: string,
    patch: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const existing = await this.findNfeDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(existing, organizationId, 'Documento NFe');

    const updated = existing.clone(patch as Parameters<NfeDocument['clone']>[0]);
    updated.validate();

    const document = await this.updateNfeDocument.execute({ entity: updated });
    await this.publishDocumentEvent('nfe', 'nfe.document.updated', document, context);
    return serializeNfeDocument(document);
  }

  async removeNfeDocument(organizationId: string, documentId: string) {
    const existing = await this.findNfeDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(existing, organizationId, 'Documento NFe');
    await this.deleteNfeDocument.execute({ id: documentId });
  }

  async listNfseDocuments(
    organizationId: string,
    page: number,
    perPage: number,
    direction?: FiscalDocumentDirection,
    companyId?: string,
  ) {
    const result = await this.findNfseDocumentPage.execute({
      organizationId,
      companyId,
      direction,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfseDocument),
    };
  }

  async createNfseDocumentRecord(
    organizationId: string,
    input: CreateNfseDocumentInput,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const document = new NfseDocument({
      organizationId,
      companyId: input.companyId,
      direction: input.direction,
      environment: input.environment,
      status: 'draft',
      model: input.model ?? 'NFSe',
      series: input.series,
      number: input.number,
      issuerCnpj: input.issuerCnpj,
    });
    document.validate();
    const created = await this.nfseDocumentRepository.create(document);

    await this.publishDocumentEvent('nfse', 'nfse.document.created', created, context);

    return serializeNfseDocument(created);
  }

  async getNfseDocument(organizationId: string, documentId: string) {
    const document = await this.findNfseDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(document, organizationId, 'Documento NFSe');
    return serializeNfseDocument(document);
  }

  async updateNfseDocumentRecord(
    organizationId: string,
    documentId: string,
    patch: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const existing = await this.findNfseDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(existing, organizationId, 'Documento NFSe');

    const updated = existing.clone(patch as Parameters<NfseDocument['clone']>[0]);
    updated.validate();

    const document = await this.updateNfseDocument.execute({ entity: updated });
    await this.publishDocumentEvent('nfse', 'nfse.document.updated', document, context);
    return serializeNfseDocument(document);
  }

  async removeNfseDocument(organizationId: string, documentId: string) {
    const existing = await this.findNfseDocumentById.execute({ id: documentId });
    this.assertOrganizationScope(existing, organizationId, 'Documento NFSe');
    await this.deleteNfseDocument.execute({ id: documentId });
  }

  async listNfeDocumentEvents(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeDocument(organizationId, documentId);

    const result = await this.findNfeDocumentEventPage.execute({
      organizationId,
      documentId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfeDocumentEvent),
    };
  }

  async listOrganizationNfeEvents(
    organizationId: string,
    page: number,
    perPage: number,
    filters?: {
      eventType?: string;
      eventStatus?: string;
      search?: string;
    },
  ) {
    const result = await this.nfeDocumentEventRepository.findPageWithDocument({
      organizationId,
      page,
      perPage,
      eventType: filters?.eventType,
      eventStatus: filters?.eventStatus,
      search: filters?.search,
    });

    return {
      ...result,
      items: result.items.map(({ event, document }) =>
        serializeNfeDocumentEventWithDocument(event, document),
      ),
    };
  }

  async getOrganizationNfeEvent(organizationId: string, eventId: string) {
    const event = await this.findNfeDocumentEventById.execute({ id: eventId });
    this.assertOrganizationScope(event, organizationId, 'Evento de documento NFe');

    if (!event) {
      throw new NotFoundError('Evento de documento NFe não encontrado');
    }

    const document = await this.findNfeDocumentById.execute({
      id: event.documentId,
    });
    if (!document || document.organizationId !== organizationId) {
      throw new NotFoundError('Evento de documento NFe não encontrado');
    }

    return serializeNfeDocumentEventWithDocument(event, {
      id: document.id,
      number: document.number,
      series: document.series,
      direction: document.direction,
      accessKey: document.accessKey ?? null,
    });
  }

  async createNfeDocumentEventRecord(
    organizationId: string,
    documentId: string,
    eventType: FiscalNfeEventType,
    sequence: number,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    await this.getNfeDocument(organizationId, documentId);

    const event = await this.createNfeDocumentEvent.execute({
      organizationId,
      documentId,
      eventType,
      sequence,
    });

    await this.publishGenericEvent(
      organizationId,
      'nfe-document-event',
      event.id,
      'nfe.document_event.created',
      {
        documentId,
        eventId: event.id,
        eventType: event.eventType,
        eventStatus: event.eventStatus,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfeDocumentEvent(event);
  }

  async getNfeDocumentEvent(
    organizationId: string,
    documentId: string,
    eventId: string,
  ) {
    await this.getNfeDocument(organizationId, documentId);

    const event = await this.findNfeDocumentEventById.execute({ id: eventId });
    this.assertOrganizationScope(event, organizationId, 'Evento de documento NFe');

    if (!event || event.documentId !== documentId) {
      throw new NotFoundError('Evento de documento NFe não encontrado');
    }

    return serializeNfeDocumentEvent(event);
  }

  async listNfseDocumentEvents(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseDocument(organizationId, documentId);

    const result = await this.findNfseDocumentEventPage.execute({
      organizationId,
      documentId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfseDocumentEvent),
    };
  }

  async createNfseDocumentEventRecord(
    organizationId: string,
    documentId: string,
    eventType: FiscalNfseEventType,
    sequence: number,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    await this.getNfseDocument(organizationId, documentId);

    const draft = new NfseDocumentEvent({
      organizationId,
      documentId,
      eventType,
      eventStatus: 'pending',
      sequence,
    });
    draft.validate();
    const created = await this.nfseDocumentEventRepository.create(draft);
    const event = created.withEventStatus('accepted');
    event.validate();
    const saved = await this.nfseDocumentEventRepository.update(event);

    await this.publishGenericEvent(
      organizationId,
      'nfse-document-event',
      saved.id,
      'nfse.document_event.created',
      {
        documentId,
        eventId: saved.id,
        eventType: saved.eventType,
        eventStatus: saved.eventStatus,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfseDocumentEvent(saved);
  }

  async getNfseDocumentEvent(
    organizationId: string,
    documentId: string,
    eventId: string,
  ) {
    await this.getNfseDocument(organizationId, documentId);

    const event = await this.findNfseDocumentEventById.execute({ id: eventId });
    this.assertOrganizationScope(event, organizationId, 'Evento de documento NFSe');

    if (!event || event.documentId !== documentId) {
      throw new NotFoundError('Evento de documento NFSe não encontrado');
    }

    return serializeNfseDocumentEvent(event);
  }

  async listNfeNumberRanges(
    organizationId: string,
    companyId: string,
    page: number,
    perPage: number,
  ) {
    const result = await this.nfeNumberRangeRepository.findPage({
      organizationId,
      companyId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfeNumberRange),
    };
  }

  async createNfeNumberRangeRecord(
    organizationId: string,
    companyId: string,
    body: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const range = new NfeNumberRange({
      organizationId,
      companyId,
      environment: body.environment as FiscalNfeEnvironment,
      model: (body.model as string) ?? '55',
      series: Number(body.series),
      numberFrom: Number(body.numberFrom),
      numberTo: Number(body.numberTo),
      justification: (body.justification as string) ?? null,
      protocol: (body.protocol as string) ?? null,
      authorizedAt: body.authorizedAt ? new Date(body.authorizedAt as string) : null,
    });
    range.validate();
    const created = await this.nfeNumberRangeRepository.create(range);

    await this.publishGenericEvent(
      organizationId,
      'nfe-number-range',
      created.id,
      'nfe.number_range.created',
      {
        companyId,
        numberRangeId: created.id,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfeNumberRange(created);
  }

  async getNfeNumberRange(
    organizationId: string,
    companyId: string,
    rangeId: string,
  ) {
    const range = await this.nfeNumberRangeRepository.findById(rangeId);
    this.assertOrganizationScope(range, organizationId, 'Faixa de numeração NFe');

    if (!range || range.companyId !== companyId) {
      throw new NotFoundError('Faixa de numeração NFe não encontrada');
    }

    return serializeNfeNumberRange(range);
  }

  async updateNfeNumberRangeRecord(
    organizationId: string,
    companyId: string,
    rangeId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeNumberRange(organizationId, companyId, rangeId);
    const range = (await this.nfeNumberRangeRepository.findById(rangeId))!;
    const updated = range.clone({
      environment: (body.environment as FiscalNfeEnvironment) ?? range.environment,
      model: (body.model as string) ?? range.model,
      series: body.series != null ? Number(body.series) : range.series,
      numberFrom: body.numberFrom != null ? Number(body.numberFrom) : range.numberFrom,
      numberTo: body.numberTo != null ? Number(body.numberTo) : range.numberTo,
      justification:
        body.justification !== undefined
          ? (body.justification as string | null)
          : range.justification,
      protocol:
        body.protocol !== undefined ? (body.protocol as string | null) : range.protocol,
      authorizedAt:
        body.authorizedAt !== undefined
          ? body.authorizedAt
            ? new Date(body.authorizedAt as string)
            : null
          : range.authorizedAt,
    });
    updated.validate();
    const saved = await this.nfeNumberRangeRepository.update(updated);
    return serializeNfeNumberRange(saved);
  }

  async removeNfeNumberRange(
    organizationId: string,
    companyId: string,
    rangeId: string,
  ) {
    await this.getNfeNumberRange(organizationId, companyId, rangeId);
    await this.nfeNumberRangeRepository.delete(rangeId);
  }

  async listNfeNumberRangeEvents(
    organizationId: string,
    companyId: string,
    rangeId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeNumberRange(organizationId, companyId, rangeId);

    const result = await this.nfeNumberRangeEventRepository.findPage({
      numberRangeId: rangeId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfeNumberRangeEvent),
    };
  }

  async createNfeNumberRangeEventRecord(
    organizationId: string,
    companyId: string,
    rangeId: string,
    body: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    await this.getNfeNumberRange(organizationId, companyId, rangeId);

    const event = new NfeNumberRangeEvent({
      numberRangeId: rangeId,
      eventType: body.eventType as FiscalNfeNumberRangeEventType,
      eventStatus: (body.eventStatus as FiscalNfeEventStatus) ?? 'pending',
      sefazStatusCode: (body.sefazStatusCode as string) ?? null,
      sefazStatusMessage: (body.sefazStatusMessage as string) ?? null,
      protocol: (body.protocol as string) ?? null,
      errorCode: (body.errorCode as string) ?? null,
      errorMessage: (body.errorMessage as string) ?? null,
    });
    event.validate();
    const created = await this.nfeNumberRangeEventRepository.create(event);

    await this.publishGenericEvent(
      organizationId,
      'nfe-number-range-event',
      created.id,
      'nfe.number_range_event.created',
      {
        companyId,
        numberRangeId: rangeId,
        eventId: created.id,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfeNumberRangeEvent(created);
  }

  async getNfeNumberRangeEvent(
    organizationId: string,
    companyId: string,
    rangeId: string,
    eventId: string,
  ) {
    await this.getNfeNumberRange(organizationId, companyId, rangeId);

    const event = await this.nfeNumberRangeEventRepository.findById(eventId);

    if (!event || event.numberRangeId !== rangeId) {
      throw new NotFoundError('Evento de faixa de numeração NFe não encontrado');
    }

    return serializeNfeNumberRangeEvent(event);
  }

  async listNfseNumberRanges(
    organizationId: string,
    companyId: string,
    page: number,
    perPage: number,
  ) {
    const result = await this.nfseNumberRangeRepository.findPage({
      organizationId,
      companyId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfseNumberRange),
    };
  }

  async createNfseNumberRangeRecord(
    organizationId: string,
    companyId: string,
    body: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    const range = new NfseNumberRange({
      organizationId,
      companyId,
      environment: body.environment as FiscalNfseEnvironment,
      model: (body.model as string) ?? 'NFSe',
      series: Number(body.series),
      numberFrom: Number(body.numberFrom),
      numberTo: Number(body.numberTo),
      justification: (body.justification as string) ?? null,
      protocol: (body.protocol as string) ?? null,
      authorizedAt: body.authorizedAt ? new Date(body.authorizedAt as string) : null,
    });
    range.validate();
    const created = await this.nfseNumberRangeRepository.create(range);

    await this.publishGenericEvent(
      organizationId,
      'nfse-number-range',
      created.id,
      'nfse.number_range.created',
      {
        companyId,
        numberRangeId: created.id,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfseNumberRange(created);
  }

  async getNfseNumberRange(
    organizationId: string,
    companyId: string,
    rangeId: string,
  ) {
    const range = await this.nfseNumberRangeRepository.findById(rangeId);
    this.assertOrganizationScope(range, organizationId, 'Faixa de numeração NFSe');

    if (!range || range.companyId !== companyId) {
      throw new NotFoundError('Faixa de numeração NFSe não encontrada');
    }

    return serializeNfseNumberRange(range);
  }

  async updateNfseNumberRangeRecord(
    organizationId: string,
    companyId: string,
    rangeId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseNumberRange(organizationId, companyId, rangeId);
    const range = (await this.nfseNumberRangeRepository.findById(rangeId))!;
    const updated = range.clone({
      environment: (body.environment as FiscalNfseEnvironment) ?? range.environment,
      model: (body.model as string) ?? range.model,
      series: body.series != null ? Number(body.series) : range.series,
      numberFrom: body.numberFrom != null ? Number(body.numberFrom) : range.numberFrom,
      numberTo: body.numberTo != null ? Number(body.numberTo) : range.numberTo,
      justification:
        body.justification !== undefined
          ? (body.justification as string | null)
          : range.justification,
      protocol:
        body.protocol !== undefined ? (body.protocol as string | null) : range.protocol,
      authorizedAt:
        body.authorizedAt !== undefined
          ? body.authorizedAt
            ? new Date(body.authorizedAt as string)
            : null
          : range.authorizedAt,
    });
    updated.validate();
    const saved = await this.nfseNumberRangeRepository.update(updated);
    return serializeNfseNumberRange(saved);
  }

  async removeNfseNumberRange(
    organizationId: string,
    companyId: string,
    rangeId: string,
  ) {
    await this.getNfseNumberRange(organizationId, companyId, rangeId);
    await this.nfseNumberRangeRepository.delete(rangeId);
  }

  async listNfseNumberRangeEvents(
    organizationId: string,
    companyId: string,
    rangeId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseNumberRange(organizationId, companyId, rangeId);

    const result = await this.nfseNumberRangeEventRepository.findPage({
      numberRangeId: rangeId,
      page,
      perPage,
    });

    return {
      ...result,
      items: result.items.map(serializeNfseNumberRangeEvent),
    };
  }

  async createNfseNumberRangeEventRecord(
    organizationId: string,
    companyId: string,
    rangeId: string,
    body: Record<string, unknown>,
    context: FiscalOperationContext = { source: 'app' },
  ) {
    await this.getNfseNumberRange(organizationId, companyId, rangeId);

    const event = new NfseNumberRangeEvent({
      numberRangeId: rangeId,
      eventType: body.eventType as FiscalNfseNumberRangeEventType,
      eventStatus: (body.eventStatus as FiscalNfseEventStatus) ?? 'pending',
      prefeituraStatusCode: (body.prefeituraStatusCode as string) ?? null,
      prefeituraStatusMessage: (body.prefeituraStatusMessage as string) ?? null,
      protocol: (body.protocol as string) ?? null,
      errorCode: (body.errorCode as string) ?? null,
      errorMessage: (body.errorMessage as string) ?? null,
    });
    event.validate();
    const created = await this.nfseNumberRangeEventRepository.create(event);

    await this.publishGenericEvent(
      organizationId,
      'nfse-number-range-event',
      created.id,
      'nfse.number_range_event.created',
      {
        companyId,
        numberRangeId: rangeId,
        eventId: created.id,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    );

    return serializeNfseNumberRangeEvent(created);
  }

  async getNfseNumberRangeEvent(
    organizationId: string,
    companyId: string,
    rangeId: string,
    eventId: string,
  ) {
    await this.getNfseNumberRange(organizationId, companyId, rangeId);

    const event = await this.nfseNumberRangeEventRepository.findById(eventId);

    if (!event || event.numberRangeId !== rangeId) {
      throw new NotFoundError('Evento de faixa de numeração NFSe não encontrado');
    }

    return serializeNfseNumberRangeEvent(event);
  }

  // --- NFe nested resources ---

  async listNfeDocumentItems(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const result = await this.nfeDocumentItemRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfeDocumentItem) };
  }

  async createNfeDocumentItemRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const item = new NfeDocumentItem({
      documentId,
      lineNumber: Number(body.lineNumber),
      prodCodigo: body.prodCodigo as string,
      descricao: body.descricao as string,
      ncm: (body.ncm as string) ?? '',
      cfop: (body.cfop as string) ?? '',
      qty: String(body.qty),
      uom: (body.uom as string) ?? 'UN',
      valorTotal: String(body.valorTotal),
      xPed: (body.xPed as string) ?? null,
      nItemPed: (body.nItemPed as string) ?? null,
      pedidoValidationStatus:
        (body.pedidoValidationStatus as FiscalNfePedidoValidationStatus) ?? 'pending',
      pedidoValidationMessage: (body.pedidoValidationMessage as string) ?? null,
      sapOrderNumber: (body.sapOrderNumber as string) ?? null,
      sapOrderItem: (body.sapOrderItem as string) ?? null,
    });
    item.validate();
    const created = await this.nfeDocumentItemRepository.create(item);
    return serializeNfeDocumentItem(created);
  }

  async getNfeDocumentItem(
    organizationId: string,
    documentId: string,
    itemId: string,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const item = await this.nfeDocumentItemRepository.findById(itemId);
    if (!item || item.documentId !== documentId) {
      throw new NotFoundError('Item de documento NFe não encontrado');
    }
    return serializeNfeDocumentItem(item);
  }

  async updateNfeDocumentItemRecord(
    organizationId: string,
    documentId: string,
    itemId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocumentItem(organizationId, documentId, itemId);
    const existing = (await this.nfeDocumentItemRepository.findById(itemId))!;
    const updated = existing.clone({
      lineNumber: body.lineNumber != null ? Number(body.lineNumber) : existing.lineNumber,
      prodCodigo: (body.prodCodigo as string) ?? existing.prodCodigo,
      descricao: (body.descricao as string) ?? existing.descricao,
      ncm: (body.ncm as string) ?? existing.ncm,
      cfop: (body.cfop as string) ?? existing.cfop,
      qty: body.qty != null ? String(body.qty) : existing.qty,
      uom: (body.uom as string) ?? existing.uom,
      valorTotal: body.valorTotal != null ? String(body.valorTotal) : existing.valorTotal,
      xPed: body.xPed !== undefined ? (body.xPed as string | null) : existing.xPed,
      nItemPed:
        body.nItemPed !== undefined ? (body.nItemPed as string | null) : existing.nItemPed,
      pedidoValidationStatus:
        (body.pedidoValidationStatus as FiscalNfePedidoValidationStatus) ??
        existing.pedidoValidationStatus,
      pedidoValidationMessage:
        body.pedidoValidationMessage !== undefined
          ? (body.pedidoValidationMessage as string | null)
          : existing.pedidoValidationMessage,
      sapOrderNumber:
        body.sapOrderNumber !== undefined
          ? (body.sapOrderNumber as string | null)
          : existing.sapOrderNumber,
      sapOrderItem:
        body.sapOrderItem !== undefined
          ? (body.sapOrderItem as string | null)
          : existing.sapOrderItem,
    });
    updated.validate();
    const saved = await this.nfeDocumentItemRepository.update(updated);
    return serializeNfeDocumentItem(saved);
  }

  async removeNfeDocumentItem(
    organizationId: string,
    documentId: string,
    itemId: string,
  ) {
    await this.getNfeDocumentItem(organizationId, documentId, itemId);
    await this.nfeDocumentItemRepository.delete(itemId);
  }

  async listNfeDocumentTimeline(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const result = await this.nfeDocumentTimelineRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfeDocumentTimeline) };
  }

  async createNfeDocumentTimelineRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const entry = new NfeDocumentTimeline({
      documentId,
      eventId: (body.eventId as string) ?? null,
      source: body.source as FiscalNfeTimelineSource,
      title: body.title as string,
      message: (body.message as string) ?? null,
      metadata: (body.metadata as Record<string, unknown>) ?? null,
      createdByUserId: (body.createdByUserId as string) ?? null,
    });
    entry.validate();
    const created = await this.nfeDocumentTimelineRepository.create(entry);
    return serializeNfeDocumentTimeline(created);
  }

  async getNfeDocumentTimelineEntry(
    organizationId: string,
    documentId: string,
    timelineId: string,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const entry = await this.nfeDocumentTimelineRepository.findById(timelineId);
    if (!entry || entry.documentId !== documentId) {
      throw new NotFoundError('Entrada de timeline NFe não encontrada');
    }
    return serializeNfeDocumentTimeline(entry);
  }

  async updateNfeDocumentTimelineRecord(
    organizationId: string,
    documentId: string,
    timelineId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocumentTimelineEntry(organizationId, documentId, timelineId);
    const existing = (await this.nfeDocumentTimelineRepository.findById(timelineId))!;
    const updated = existing.clone({
      eventId: body.eventId !== undefined ? (body.eventId as string | null) : existing.eventId,
      source: (body.source as FiscalNfeTimelineSource) ?? existing.source,
      title: (body.title as string) ?? existing.title,
      message: body.message !== undefined ? (body.message as string | null) : existing.message,
      metadata:
        body.metadata !== undefined
          ? (body.metadata as Record<string, unknown> | null)
          : existing.metadata,
      createdByUserId:
        body.createdByUserId !== undefined
          ? (body.createdByUserId as string | null)
          : existing.createdByUserId,
    });
    updated.validate();
    const saved = await this.nfeDocumentTimelineRepository.update(updated);
    return serializeNfeDocumentTimeline(saved);
  }

  async removeNfeDocumentTimelineEntry(
    organizationId: string,
    documentId: string,
    timelineId: string,
  ) {
    await this.getNfeDocumentTimelineEntry(organizationId, documentId, timelineId);
    await this.nfeDocumentTimelineRepository.delete(timelineId);
  }

  async listNfeDocumentAttachments(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const result = await this.nfeDocumentAttachmentRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfeDocumentAttachment) };
  }

  async createNfeDocumentAttachmentRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const attachment = new NfeDocumentAttachment({
      documentId,
      eventId: (body.eventId as string) ?? null,
      kind: body.kind as FiscalNfeAttachmentKind,
      fileName: body.fileName as string,
      contentType: (body.contentType as string) ?? null,
      storageKey: body.storageKey as string,
      content: (body.content as string) ?? null,
      sizeBytes: body.sizeBytes != null ? Number(body.sizeBytes) : null,
      checksumSha256: (body.checksumSha256 as string) ?? null,
    });
    attachment.validate();
    const created = await this.nfeDocumentAttachmentRepository.create(attachment);
    return serializeNfeDocumentAttachment(created);
  }

  async getNfeDocumentAttachment(
    organizationId: string,
    documentId: string,
    attachmentId: string,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const attachment = await this.nfeDocumentAttachmentRepository.findById(attachmentId);
    if (!attachment || attachment.documentId !== documentId) {
      throw new NotFoundError('Anexo de documento NFe não encontrado');
    }
    return serializeNfeDocumentAttachment(attachment);
  }

  async updateNfeDocumentAttachmentRecord(
    organizationId: string,
    documentId: string,
    attachmentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocumentAttachment(organizationId, documentId, attachmentId);
    const existing = (await this.nfeDocumentAttachmentRepository.findById(attachmentId))!;
    const updated = existing.clone({
      eventId: body.eventId !== undefined ? (body.eventId as string | null) : existing.eventId,
      kind: (body.kind as FiscalNfeAttachmentKind) ?? existing.kind,
      fileName: (body.fileName as string) ?? existing.fileName,
      contentType:
        body.contentType !== undefined ? (body.contentType as string | null) : existing.contentType,
      storageKey: (body.storageKey as string) ?? existing.storageKey,
      content: body.content !== undefined ? (body.content as string | null) : existing.content,
      sizeBytes:
        body.sizeBytes !== undefined
          ? body.sizeBytes != null
            ? Number(body.sizeBytes)
            : null
          : existing.sizeBytes,
      checksumSha256:
        body.checksumSha256 !== undefined
          ? (body.checksumSha256 as string | null)
          : existing.checksumSha256,
    });
    updated.validate();
    const saved = await this.nfeDocumentAttachmentRepository.update(updated);
    return serializeNfeDocumentAttachment(saved);
  }

  async removeNfeDocumentAttachment(
    organizationId: string,
    documentId: string,
    attachmentId: string,
  ) {
    await this.getNfeDocumentAttachment(organizationId, documentId, attachmentId);
    await this.nfeDocumentAttachmentRepository.delete(attachmentId);
  }

  async getNfeInboundProcess(organizationId: string, documentId: string) {
    await this.getNfeDocument(organizationId, documentId);
    await this.nfeInboundService.reconcileMiroStatus(documentId);
    const process = await this.nfeInboundProcessRepository.findByDocumentId(documentId);
    if (!process) {
      throw new NotFoundError('Processo inbound NFe não encontrado');
    }
    return serializeNfeInboundProcess(process);
  }

  async createNfeInboundProcessRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const process = new NfeInboundProcess({
      id: documentId,
      documentId,
      inboundStatus: (body.inboundStatus as FiscalNfeInboundStatus) ?? 'xml_imported',
      statusChangedAt: body.statusChangedAt
        ? new Date(body.statusChangedAt as string)
        : new Date(),
      sefazValidatedAt: body.sefazValidatedAt
        ? new Date(body.sefazValidatedAt as string)
        : null,
      pedidoValidatedAt: body.pedidoValidatedAt
        ? new Date(body.pedidoValidatedAt as string)
        : null,
      deliveryCreatedAt: body.deliveryCreatedAt
        ? new Date(body.deliveryCreatedAt as string)
        : null,
      portariaConfirmedAt: body.portariaConfirmedAt
        ? new Date(body.portariaConfirmedAt as string)
        : null,
      portariaConfirmedByUserId: (body.portariaConfirmedByUserId as string) ?? null,
      migoCompletedAt: body.migoCompletedAt ? new Date(body.migoCompletedAt as string) : null,
      miroCompletedAt: body.miroCompletedAt ? new Date(body.miroCompletedAt as string) : null,
      rejectedAt: body.rejectedAt ? new Date(body.rejectedAt as string) : null,
      rejectedByUserId: (body.rejectedByUserId as string) ?? null,
      rejectionReason: (body.rejectionReason as string) ?? null,
      alertCode: (body.alertCode as string) ?? null,
      alertMessage: (body.alertMessage as string) ?? null,
      correlationId: (body.correlationId as string) ?? null,
    });
    process.validate();
    const created = await this.nfeInboundProcessRepository.create(process);
    await this.fiscalFlowFacade.tryStartFlowForInboundDocument(documentId);
    return serializeNfeInboundProcess(created);
  }

  async updateNfeInboundProcessRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.nfeInboundProcessRepository.findByDocumentId(documentId);
    if (!existing) {
      throw new NotFoundError('Processo inbound NFe não encontrado');
    }
    await this.getNfeDocument(organizationId, documentId);
    const updated = existing.clone({
      inboundStatus:
        (body.inboundStatus as FiscalNfeInboundStatus) ?? existing.inboundStatus,
      statusChangedAt: body.statusChangedAt
        ? new Date(body.statusChangedAt as string)
        : new Date(),
      sefazValidatedAt:
        body.sefazValidatedAt !== undefined
          ? body.sefazValidatedAt
            ? new Date(body.sefazValidatedAt as string)
            : null
          : existing.sefazValidatedAt,
      pedidoValidatedAt:
        body.pedidoValidatedAt !== undefined
          ? body.pedidoValidatedAt
            ? new Date(body.pedidoValidatedAt as string)
            : null
          : existing.pedidoValidatedAt,
      deliveryCreatedAt:
        body.deliveryCreatedAt !== undefined
          ? body.deliveryCreatedAt
            ? new Date(body.deliveryCreatedAt as string)
            : null
          : existing.deliveryCreatedAt,
      portariaConfirmedAt:
        body.portariaConfirmedAt !== undefined
          ? body.portariaConfirmedAt
            ? new Date(body.portariaConfirmedAt as string)
            : null
          : existing.portariaConfirmedAt,
      portariaConfirmedByUserId:
        body.portariaConfirmedByUserId !== undefined
          ? (body.portariaConfirmedByUserId as string | null)
          : existing.portariaConfirmedByUserId,
      migoCompletedAt:
        body.migoCompletedAt !== undefined
          ? body.migoCompletedAt
            ? new Date(body.migoCompletedAt as string)
            : null
          : existing.migoCompletedAt,
      miroCompletedAt:
        body.miroCompletedAt !== undefined
          ? body.miroCompletedAt
            ? new Date(body.miroCompletedAt as string)
            : null
          : existing.miroCompletedAt,
      rejectedAt:
        body.rejectedAt !== undefined
          ? body.rejectedAt
            ? new Date(body.rejectedAt as string)
            : null
          : existing.rejectedAt,
      rejectedByUserId:
        body.rejectedByUserId !== undefined
          ? (body.rejectedByUserId as string | null)
          : existing.rejectedByUserId,
      rejectionReason:
        body.rejectionReason !== undefined
          ? (body.rejectionReason as string | null)
          : existing.rejectionReason,
      alertCode:
        body.alertCode !== undefined ? (body.alertCode as string | null) : existing.alertCode,
      alertMessage:
        body.alertMessage !== undefined
          ? (body.alertMessage as string | null)
          : existing.alertMessage,
      correlationId:
        body.correlationId !== undefined
          ? (body.correlationId as string | null)
          : existing.correlationId,
    });
    updated.validate();
    const saved = await this.nfeInboundProcessRepository.update(updated);
    return serializeNfeInboundProcess(saved);
  }

  async removeNfeInboundProcess(organizationId: string, documentId: string) {
    await this.getNfeInboundProcess(organizationId, documentId);
    await this.nfeInboundProcessRepository.delete(documentId);
  }

  async listNfeSapDocuments(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const result = await this.nfeSapDocumentRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfeSapDocument) };
  }

  async createNfeSapDocumentRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const sapDoc = new NfeSapDocument({
      documentId,
      itemId: (body.itemId as string) ?? null,
      documentType: body.documentType as FiscalNfeSapDocumentType,
      docNumber: body.docNumber as string,
      itemNumber: (body.itemNumber as string) ?? null,
      fiscalYear: (body.fiscalYear as string) ?? null,
      status: (body.status as FiscalNfeSapDocumentStatus) ?? 'pending',
      rawResponse: (body.rawResponse as Record<string, unknown>) ?? null,
    });
    sapDoc.validate();
    const created = await this.nfeSapDocumentRepository.create(sapDoc);
    return serializeNfeSapDocument(created);
  }

  async getNfeSapDocument(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
  ) {
    await this.getNfeDocument(organizationId, documentId);
    const sapDoc = await this.nfeSapDocumentRepository.findById(sapDocumentId);
    if (!sapDoc || sapDoc.documentId !== documentId) {
      throw new NotFoundError('Documento SAP NFe não encontrado');
    }
    return serializeNfeSapDocument(sapDoc);
  }

  async updateNfeSapDocumentRecord(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfeSapDocument(organizationId, documentId, sapDocumentId);
    const existing = (await this.nfeSapDocumentRepository.findById(sapDocumentId))!;
    const updated = existing.clone({
      itemId: body.itemId !== undefined ? (body.itemId as string | null) : existing.itemId,
      documentType:
        (body.documentType as FiscalNfeSapDocumentType) ?? existing.documentType,
      docNumber: (body.docNumber as string) ?? existing.docNumber,
      itemNumber:
        body.itemNumber !== undefined ? (body.itemNumber as string | null) : existing.itemNumber,
      fiscalYear:
        body.fiscalYear !== undefined ? (body.fiscalYear as string | null) : existing.fiscalYear,
      status: (body.status as FiscalNfeSapDocumentStatus) ?? existing.status,
      rawResponse:
        body.rawResponse !== undefined
          ? (body.rawResponse as Record<string, unknown> | null)
          : existing.rawResponse,
    });
    updated.validate();
    const saved = await this.nfeSapDocumentRepository.update(updated);
    return serializeNfeSapDocument(saved);
  }

  async removeNfeSapDocument(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
  ) {
    await this.getNfeSapDocument(organizationId, documentId, sapDocumentId);
    await this.nfeSapDocumentRepository.delete(sapDocumentId);
  }

  // --- NFSe nested resources (mirror NFe) ---

  async listNfseDocumentItems(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const result = await this.nfseDocumentItemRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfseDocumentItem) };
  }

  async createNfseDocumentItemRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const item = new NfseDocumentItem({
      documentId,
      lineNumber: Number(body.lineNumber),
      prodCodigo: body.prodCodigo as string,
      descricao: body.descricao as string,
      serviceCode: (body.serviceCode as string) ?? '',
      municipalityCode: (body.municipalityCode as string) ?? '',
      qty: String(body.qty),
      uom: (body.uom as string) ?? 'UN',
      valorTotal: String(body.valorTotal),
      xPed: (body.xPed as string) ?? null,
      nItemPed: (body.nItemPed as string) ?? null,
      pedidoValidationStatus:
        (body.pedidoValidationStatus as FiscalNfsePedidoValidationStatus) ?? 'pending',
      pedidoValidationMessage: (body.pedidoValidationMessage as string) ?? null,
      sapOrderNumber: (body.sapOrderNumber as string) ?? null,
      sapOrderItem: (body.sapOrderItem as string) ?? null,
    });
    item.validate();
    const created = await this.nfseDocumentItemRepository.create(item);
    return serializeNfseDocumentItem(created);
  }

  async getNfseDocumentItem(
    organizationId: string,
    documentId: string,
    itemId: string,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const item = await this.nfseDocumentItemRepository.findById(itemId);
    if (!item || item.documentId !== documentId) {
      throw new NotFoundError('Item de documento NFSe não encontrado');
    }
    return serializeNfseDocumentItem(item);
  }

  async updateNfseDocumentItemRecord(
    organizationId: string,
    documentId: string,
    itemId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocumentItem(organizationId, documentId, itemId);
    const existing = (await this.nfseDocumentItemRepository.findById(itemId))!;
    const updated = existing.clone({
      lineNumber: body.lineNumber != null ? Number(body.lineNumber) : existing.lineNumber,
      prodCodigo: (body.prodCodigo as string) ?? existing.prodCodigo,
      descricao: (body.descricao as string) ?? existing.descricao,
      serviceCode: (body.serviceCode as string) ?? existing.serviceCode,
      municipalityCode: (body.municipalityCode as string) ?? existing.municipalityCode,
      qty: body.qty != null ? String(body.qty) : existing.qty,
      uom: (body.uom as string) ?? existing.uom,
      valorTotal: body.valorTotal != null ? String(body.valorTotal) : existing.valorTotal,
      xPed: body.xPed !== undefined ? (body.xPed as string | null) : existing.xPed,
      nItemPed:
        body.nItemPed !== undefined ? (body.nItemPed as string | null) : existing.nItemPed,
      pedidoValidationStatus:
        (body.pedidoValidationStatus as FiscalNfsePedidoValidationStatus) ??
        existing.pedidoValidationStatus,
      pedidoValidationMessage:
        body.pedidoValidationMessage !== undefined
          ? (body.pedidoValidationMessage as string | null)
          : existing.pedidoValidationMessage,
      sapOrderNumber:
        body.sapOrderNumber !== undefined
          ? (body.sapOrderNumber as string | null)
          : existing.sapOrderNumber,
      sapOrderItem:
        body.sapOrderItem !== undefined
          ? (body.sapOrderItem as string | null)
          : existing.sapOrderItem,
    });
    updated.validate();
    const saved = await this.nfseDocumentItemRepository.update(updated);
    return serializeNfseDocumentItem(saved);
  }

  async removeNfseDocumentItem(
    organizationId: string,
    documentId: string,
    itemId: string,
  ) {
    await this.getNfseDocumentItem(organizationId, documentId, itemId);
    await this.nfseDocumentItemRepository.delete(itemId);
  }

  async listNfseDocumentTimeline(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const result = await this.nfseDocumentTimelineRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfseDocumentTimeline) };
  }

  async createNfseDocumentTimelineRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const entry = new NfseDocumentTimeline({
      documentId,
      eventId: (body.eventId as string) ?? null,
      source: body.source as FiscalNfseTimelineSource,
      title: body.title as string,
      message: (body.message as string) ?? null,
      metadata: (body.metadata as Record<string, unknown>) ?? null,
      createdByUserId: (body.createdByUserId as string) ?? null,
    });
    entry.validate();
    const created = await this.nfseDocumentTimelineRepository.create(entry);
    return serializeNfseDocumentTimeline(created);
  }

  async getNfseDocumentTimelineEntry(
    organizationId: string,
    documentId: string,
    timelineId: string,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const entry = await this.nfseDocumentTimelineRepository.findById(timelineId);
    if (!entry || entry.documentId !== documentId) {
      throw new NotFoundError('Entrada de timeline NFSe não encontrada');
    }
    return serializeNfseDocumentTimeline(entry);
  }

  async updateNfseDocumentTimelineRecord(
    organizationId: string,
    documentId: string,
    timelineId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocumentTimelineEntry(organizationId, documentId, timelineId);
    const existing = (await this.nfseDocumentTimelineRepository.findById(timelineId))!;
    const updated = existing.clone({
      eventId: body.eventId !== undefined ? (body.eventId as string | null) : existing.eventId,
      source: (body.source as FiscalNfseTimelineSource) ?? existing.source,
      title: (body.title as string) ?? existing.title,
      message: body.message !== undefined ? (body.message as string | null) : existing.message,
      metadata:
        body.metadata !== undefined
          ? (body.metadata as Record<string, unknown> | null)
          : existing.metadata,
      createdByUserId:
        body.createdByUserId !== undefined
          ? (body.createdByUserId as string | null)
          : existing.createdByUserId,
    });
    updated.validate();
    const saved = await this.nfseDocumentTimelineRepository.update(updated);
    return serializeNfseDocumentTimeline(saved);
  }

  async removeNfseDocumentTimelineEntry(
    organizationId: string,
    documentId: string,
    timelineId: string,
  ) {
    await this.getNfseDocumentTimelineEntry(organizationId, documentId, timelineId);
    await this.nfseDocumentTimelineRepository.delete(timelineId);
  }

  async listNfseDocumentAttachments(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const result = await this.nfseDocumentAttachmentRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfseDocumentAttachment) };
  }

  async createNfseDocumentAttachmentRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const attachment = new NfseDocumentAttachment({
      documentId,
      eventId: (body.eventId as string) ?? null,
      kind: body.kind as FiscalNfseAttachmentKind,
      fileName: body.fileName as string,
      contentType: (body.contentType as string) ?? null,
      storageKey: body.storageKey as string,
      content: (body.content as string) ?? null,
      sizeBytes: body.sizeBytes != null ? Number(body.sizeBytes) : null,
      checksumSha256: (body.checksumSha256 as string) ?? null,
    });
    attachment.validate();
    const created = await this.nfseDocumentAttachmentRepository.create(attachment);
    return serializeNfseDocumentAttachment(created);
  }

  async getNfseDocumentAttachment(
    organizationId: string,
    documentId: string,
    attachmentId: string,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const attachment = await this.nfseDocumentAttachmentRepository.findById(attachmentId);
    if (!attachment || attachment.documentId !== documentId) {
      throw new NotFoundError('Anexo de documento NFSe não encontrado');
    }
    return serializeNfseDocumentAttachment(attachment);
  }

  async updateNfseDocumentAttachmentRecord(
    organizationId: string,
    documentId: string,
    attachmentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocumentAttachment(organizationId, documentId, attachmentId);
    const existing = (await this.nfseDocumentAttachmentRepository.findById(attachmentId))!;
    const updated = existing.clone({
      eventId: body.eventId !== undefined ? (body.eventId as string | null) : existing.eventId,
      kind: (body.kind as FiscalNfseAttachmentKind) ?? existing.kind,
      fileName: (body.fileName as string) ?? existing.fileName,
      contentType:
        body.contentType !== undefined ? (body.contentType as string | null) : existing.contentType,
      storageKey: (body.storageKey as string) ?? existing.storageKey,
      content: body.content !== undefined ? (body.content as string | null) : existing.content,
      sizeBytes:
        body.sizeBytes !== undefined
          ? body.sizeBytes != null
            ? Number(body.sizeBytes)
            : null
          : existing.sizeBytes,
      checksumSha256:
        body.checksumSha256 !== undefined
          ? (body.checksumSha256 as string | null)
          : existing.checksumSha256,
    });
    updated.validate();
    const saved = await this.nfseDocumentAttachmentRepository.update(updated);
    return serializeNfseDocumentAttachment(saved);
  }

  async removeNfseDocumentAttachment(
    organizationId: string,
    documentId: string,
    attachmentId: string,
  ) {
    await this.getNfseDocumentAttachment(organizationId, documentId, attachmentId);
    await this.nfseDocumentAttachmentRepository.delete(attachmentId);
  }

  async getNfseInboundProcess(organizationId: string, documentId: string) {
    await this.getNfseDocument(organizationId, documentId);
    const process = await this.nfseInboundProcessRepository.findByDocumentId(documentId);
    if (!process) {
      throw new NotFoundError('Processo inbound NFSe não encontrado');
    }
    return serializeNfseInboundProcess(process);
  }

  async createNfseInboundProcessRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const process = new NfseInboundProcess({
      id: documentId,
      documentId,
      inboundStatus: (body.inboundStatus as FiscalNfseInboundStatus) ?? 'xml_imported',
      statusChangedAt: body.statusChangedAt
        ? new Date(body.statusChangedAt as string)
        : new Date(),
      prefeituraValidatedAt: body.prefeituraValidatedAt
        ? new Date(body.prefeituraValidatedAt as string)
        : null,
      pedidoValidatedAt: body.pedidoValidatedAt
        ? new Date(body.pedidoValidatedAt as string)
        : null,
      deliveryCreatedAt: body.deliveryCreatedAt
        ? new Date(body.deliveryCreatedAt as string)
        : null,
      portariaConfirmedAt: body.portariaConfirmedAt
        ? new Date(body.portariaConfirmedAt as string)
        : null,
      portariaConfirmedByUserId: (body.portariaConfirmedByUserId as string) ?? null,
      migoCompletedAt: body.migoCompletedAt ? new Date(body.migoCompletedAt as string) : null,
      miroCompletedAt: body.miroCompletedAt ? new Date(body.miroCompletedAt as string) : null,
      rejectedAt: body.rejectedAt ? new Date(body.rejectedAt as string) : null,
      rejectedByUserId: (body.rejectedByUserId as string) ?? null,
      rejectionReason: (body.rejectionReason as string) ?? null,
      alertCode: (body.alertCode as string) ?? null,
      alertMessage: (body.alertMessage as string) ?? null,
      correlationId: (body.correlationId as string) ?? null,
    });
    process.validate();
    const created = await this.nfseInboundProcessRepository.create(process);
    return serializeNfseInboundProcess(created);
  }

  async updateNfseInboundProcessRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    const existing = await this.nfseInboundProcessRepository.findByDocumentId(documentId);
    if (!existing) {
      throw new NotFoundError('Processo inbound NFSe não encontrado');
    }
    await this.getNfseDocument(organizationId, documentId);
    const updated = existing.clone({
      inboundStatus:
        (body.inboundStatus as FiscalNfseInboundStatus) ?? existing.inboundStatus,
      statusChangedAt: body.statusChangedAt
        ? new Date(body.statusChangedAt as string)
        : new Date(),
      prefeituraValidatedAt:
        body.prefeituraValidatedAt !== undefined
          ? body.prefeituraValidatedAt
            ? new Date(body.prefeituraValidatedAt as string)
            : null
          : existing.prefeituraValidatedAt,
      pedidoValidatedAt:
        body.pedidoValidatedAt !== undefined
          ? body.pedidoValidatedAt
            ? new Date(body.pedidoValidatedAt as string)
            : null
          : existing.pedidoValidatedAt,
      deliveryCreatedAt:
        body.deliveryCreatedAt !== undefined
          ? body.deliveryCreatedAt
            ? new Date(body.deliveryCreatedAt as string)
            : null
          : existing.deliveryCreatedAt,
      portariaConfirmedAt:
        body.portariaConfirmedAt !== undefined
          ? body.portariaConfirmedAt
            ? new Date(body.portariaConfirmedAt as string)
            : null
          : existing.portariaConfirmedAt,
      portariaConfirmedByUserId:
        body.portariaConfirmedByUserId !== undefined
          ? (body.portariaConfirmedByUserId as string | null)
          : existing.portariaConfirmedByUserId,
      migoCompletedAt:
        body.migoCompletedAt !== undefined
          ? body.migoCompletedAt
            ? new Date(body.migoCompletedAt as string)
            : null
          : existing.migoCompletedAt,
      miroCompletedAt:
        body.miroCompletedAt !== undefined
          ? body.miroCompletedAt
            ? new Date(body.miroCompletedAt as string)
            : null
          : existing.miroCompletedAt,
      rejectedAt:
        body.rejectedAt !== undefined
          ? body.rejectedAt
            ? new Date(body.rejectedAt as string)
            : null
          : existing.rejectedAt,
      rejectedByUserId:
        body.rejectedByUserId !== undefined
          ? (body.rejectedByUserId as string | null)
          : existing.rejectedByUserId,
      rejectionReason:
        body.rejectionReason !== undefined
          ? (body.rejectionReason as string | null)
          : existing.rejectionReason,
      alertCode:
        body.alertCode !== undefined ? (body.alertCode as string | null) : existing.alertCode,
      alertMessage:
        body.alertMessage !== undefined
          ? (body.alertMessage as string | null)
          : existing.alertMessage,
      correlationId:
        body.correlationId !== undefined
          ? (body.correlationId as string | null)
          : existing.correlationId,
    });
    updated.validate();
    const saved = await this.nfseInboundProcessRepository.update(updated);
    return serializeNfseInboundProcess(saved);
  }

  async removeNfseInboundProcess(organizationId: string, documentId: string) {
    await this.getNfseInboundProcess(organizationId, documentId);
    await this.nfseInboundProcessRepository.delete(documentId);
  }

  async listNfseSapDocuments(
    organizationId: string,
    documentId: string,
    page: number,
    perPage: number,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const result = await this.nfseSapDocumentRepository.findPage({
      documentId,
      page,
      perPage,
    });
    return { ...result, items: result.items.map(serializeNfseSapDocument) };
  }

  async createNfseSapDocumentRecord(
    organizationId: string,
    documentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const sapDoc = new NfseSapDocument({
      documentId,
      itemId: (body.itemId as string) ?? null,
      documentType: body.documentType as FiscalNfseSapDocumentType,
      docNumber: body.docNumber as string,
      itemNumber: (body.itemNumber as string) ?? null,
      fiscalYear: (body.fiscalYear as string) ?? null,
      status: (body.status as FiscalNfseSapDocumentStatus) ?? 'pending',
      rawResponse: (body.rawResponse as Record<string, unknown>) ?? null,
    });
    sapDoc.validate();
    const created = await this.nfseSapDocumentRepository.create(sapDoc);
    return serializeNfseSapDocument(created);
  }

  async getNfseSapDocument(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
  ) {
    await this.getNfseDocument(organizationId, documentId);
    const sapDoc = await this.nfseSapDocumentRepository.findById(sapDocumentId);
    if (!sapDoc || sapDoc.documentId !== documentId) {
      throw new NotFoundError('Documento SAP NFSe não encontrado');
    }
    return serializeNfseSapDocument(sapDoc);
  }

  async updateNfseSapDocumentRecord(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
    body: Record<string, unknown>,
  ) {
    await this.getNfseSapDocument(organizationId, documentId, sapDocumentId);
    const existing = (await this.nfseSapDocumentRepository.findById(sapDocumentId))!;
    const updated = existing.clone({
      itemId: body.itemId !== undefined ? (body.itemId as string | null) : existing.itemId,
      documentType:
        (body.documentType as FiscalNfseSapDocumentType) ?? existing.documentType,
      docNumber: (body.docNumber as string) ?? existing.docNumber,
      itemNumber:
        body.itemNumber !== undefined ? (body.itemNumber as string | null) : existing.itemNumber,
      fiscalYear:
        body.fiscalYear !== undefined ? (body.fiscalYear as string | null) : existing.fiscalYear,
      status: (body.status as FiscalNfseSapDocumentStatus) ?? existing.status,
      rawResponse:
        body.rawResponse !== undefined
          ? (body.rawResponse as Record<string, unknown> | null)
          : existing.rawResponse,
    });
    updated.validate();
    const saved = await this.nfseSapDocumentRepository.update(updated);
    return serializeNfseSapDocument(saved);
  }

  async removeNfseSapDocument(
    organizationId: string,
    documentId: string,
    sapDocumentId: string,
  ) {
    await this.getNfseSapDocument(organizationId, documentId, sapDocumentId);
    await this.nfseSapDocumentRepository.delete(sapDocumentId);
  }

  private async publishDocumentEvent(
    aggregateType: 'nfe' | 'nfse',
    eventType: WebhookEventType,
    document: NfeDocument | NfseDocument,
    context: FiscalOperationContext,
  ) {
    await this.domainEventPublisher.publish({
      organizationId: document.organizationId,
      aggregateType: `${aggregateType}-document`,
      aggregateId: document.id,
      eventType,
      payload: {
        documentId: document.id,
        companyId: document.companyId,
        status: document.status,
        accessKey: document.accessKey ?? null,
        source: context.source ?? 'app',
        integrationTokenId: context.integrationTokenId ?? null,
      },
    });
  }

  private async publishGenericEvent(
    organizationId: string,
    aggregateType: string,
    aggregateId: string,
    eventType: WebhookEventType,
    payload: Record<string, unknown>,
  ) {
    await this.domainEventPublisher.publish({
      organizationId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
    });
  }

  private assertOrganizationScope<T extends { organizationId: string } | null>(
    entity: T,
    organizationId: string,
    label: string,
  ): asserts entity is NonNullable<T> {
    if (!entity || entity.organizationId !== organizationId) {
      throw new NotFoundError(`${label} não encontrado`);
    }
  }
}
