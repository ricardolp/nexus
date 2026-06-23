import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  canTransitionInbound,
  compareNfeWithSapPedido,
  INBOUND_STATUS_LABELS,
  mapParsedItemsForValidation,
  NfeInboundStatus,
  parseNfeXml,
  parseNfeXmlDetail,
  parseValidationStepConfig,
  resolveOrganizationCompanyDocument,
  type NfeValidationStepConfig,
  type ParsedNfeXml,
  type ValidationIssue,
} from '@nexus/fiscal';
import {
  DomainError,
  NotFoundError,
  ValidationError,
  type WebhookEventType,
} from '@nexus/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../db/prisma.service';
import { DomainEventPublisherService } from '../integration/domain-event-publisher.service';
import { SapInboundAdapterService } from './integrations/sap-inbound-adapter.service';
import { formatSapDocDate } from './integrations/sap/sap-delivery.client';
import type { SapPedidoCompraLine } from './integrations/sap/sap-purchase-orders.types';

type DbClient = PrismaService | Prisma.TransactionClient;

export type NfeInboundQueueServicePort = {
  enqueuePostImport(documentId: string): Promise<void>;
  enqueueMiro(documentId: string): Promise<void>;
  removeJobsForDocument(documentId: string): Promise<void>;
};

export type ImportInboundDocumentInput = {
  organizationId: string;
  companyId?: string;
  xmlBuffer: Buffer;
  fileName: string;
  triggeredByUserId?: string;
};

export type ImportInboundDocumentResult = {
  documentId: string;
  attachmentId: string;
  direction: 'inbound' | 'outbound';
  inboundStarted: boolean;
  postImportMode: 'queued' | 'inline' | 'not_applicable';
};

export type PostImportPipelineResult = {
  documentId: string;
  ran: boolean;
  skippedReason?: 'document_not_found' | 'not_inbound';
  pedidoValidation: PedidoValidationResult | null;
  businessValidation: BusinessValidationRunResult | null;
  deliveryCreated: boolean;
};

export type BusinessValidationRunResult = {
  documentId: string;
  passed: boolean;
  issues: ValidationIssue[];
};

export type PedidoValidationResult = {
  documentId: string;
  matched: boolean;
  reason?: 'no_purchase_order' | 'sap_error' | 'order_not_found';
  primaryOrder?: string;
  lines: Array<{
    xPed: string;
    nItemPed: string;
    matched: boolean;
    sapOrderNumber?: string;
    sapOrderItem?: string;
    message?: string;
  }>;
};

export type CreateDeliveryResult = {
  documentId: string;
  deliveryNumber: string;
  fiscalYear?: string;
  inboundStatus: NfeInboundStatus;
};

export type ConfirmPortariaInput = {
  organizationId: string;
  documentId: string;
  userId: string;
};

export type ConfirmPortariaResult = {
  documentId: string;
  inboundStatus: NfeInboundStatus;
  migoNumber: string;
  miroMode: 'queued' | 'inline';
};

export type RegisterMigoInput = {
  organizationId: string;
  documentId: string;
  userId: string;
  migoNumber?: string;
  migoItem?: string;
  fiscalYear?: string;
  accountingDocNumber?: string;
  useSapStub?: boolean;
};

export type RegisterMigoResult = {
  documentId: string;
  inboundStatus: NfeInboundStatus;
  migoNumber: string;
  miroMode: 'queued' | 'inline';
};

export type RunMiroResult = {
  documentId: string;
  processed: boolean;
  skippedReason?: 'inbound_process_not_found' | 'invalid_status' | 'document_not_found';
  miroNumber?: string;
  fiscalYear?: string;
  accountingDocNumber?: string;
  inboundStatus?: NfeInboundStatus;
};

export type RejectInboundInput = {
  organizationId: string;
  documentId: string;
  userId: string;
  reason: string;
};

export type RejectInboundResult = {
  documentId: string;
  inboundStatus: NfeInboundStatus;
};

export type RetrySapStepInput = {
  organizationId: string;
  documentId: string;
  step: 'pedido' | 'delivery' | 'miro';
  userId: string;
};

export type RetrySapStepResult = {
  documentId: string;
  step: 'pedido' | 'delivery' | 'miro';
  targetStatus: NfeInboundStatus;
  mode: 'queued' | 'inline';
};

export type ReprocessInboundInput = {
  organizationId: string;
  documentId: string;
  userId: string;
  runInline?: boolean;
};

export type ReprocessInboundResult = {
  documentId: string;
  mode: 'queued' | 'inline';
};

export type ResetInboundInput = {
  organizationId: string;
  documentId: string;
  userId: string;
};

export type ResetInboundResult = {
  documentId: string;
  inboundStatus: NfeInboundStatus;
  removedSapDocuments: number;
};

export type DeleteDocumentCascadeInput = {
  organizationId: string;
  documentId: string;
};

export type DeleteDocumentCascadeResult = {
  documentId: string;
};

type TransitionInboundStatusInput = {
  organizationId: string;
  documentId: string;
  to: NfeInboundStatus;
  eventType?: 'inbound_status_change' | 'pedido_validation' | 'sap_delivery_create' | 'sap_migo' | 'sap_miro' | 'inbound_rejection' | 'portaria_confirmation';
  title: string;
  message?: string;
  source?: 'system' | 'user' | 'sefaz' | 'sap' | 'webhook' | 'job' | 'api';
  triggeredByUserId?: string;
  correlationId?: string;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  patchProcess?: Partial<{
    sefaz_validated_at: Date | null;
    pedido_validated_at: Date | null;
    delivery_created_at: Date | null;
    portaria_confirmed_at: Date | null;
    portaria_confirmed_by_user_id: string | null;
    migo_completed_at: Date | null;
    miro_completed_at: Date | null;
    rejected_at: Date | null;
    rejected_by_user_id: string | null;
    rejection_reason: string | null;
    alert_code: string | null;
    alert_message: string | null;
    correlation_id: string | null;
  }>;
};

@Injectable()
export class NfeInboundService {
  private readonly logger = new Logger(NfeInboundService.name);
  private queueService?: NfeInboundQueueServicePort;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sapInboundAdapterService: SapInboundAdapterService,
    private readonly domainEventPublisher: DomainEventPublisherService,
  ) {}

  setQueueService(queueService: NfeInboundQueueServicePort): void {
    this.queueService = queueService;
  }

  async importDocument(
    input: ImportInboundDocumentInput,
  ): Promise<ImportInboundDocumentResult> {
    const xmlText = input.xmlBuffer.toString('utf8');
    const parsed = parseNfeXml(input.xmlBuffer);
    const parsedDetail = parseNfeXmlDetail(input.xmlBuffer);

    await this.assertAccessKeyNotDuplicate(parsed.accessKey);
    const company = await this.resolveCompany(input.organizationId, parsed, input.companyId);
    const direction = this.resolveDirectionForOrganization(parsed, company.cnpj);
    const checksumSha256 = createHash('sha256')
      .update(input.xmlBuffer)
      .digest('hex');
    const attachmentKind =
      parsed.status === 'authorized' ? 'xml_authorized' : 'xml_distribution';

    const txResult = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const document = await tx.fiscalNfeDocument.create({
        data: {
          organization_id: input.organizationId,
          company_id: company.id,
          direction,
          environment: parsed.environment,
          status: parsed.status,
          model: parsed.model,
          series: parsed.series,
          number: parsed.number,
          access_key: parsed.accessKey,
          issuer_cnpj: parsed.issuerCnpj,
          issuer_name: parsedDetail.emitente.razaoSocial,
          recipient_document: parsed.recipientDocument,
          recipient_name: parsed.recipientName,
          total_amount: parsed.totalAmount,
          issued_at: parsed.issuedAt,
          authorized_at: parsed.authorizedAt,
          authorization_protocol: parsed.authorizationProtocol,
          sefaz_status_code: parsed.sefazStatusCode,
          sefaz_status_message: parsed.sefazStatusMessage,
          idempotency_key: parsed.accessKey,
          metadata: {
            importSource: 'api_upload',
            fileName: input.fileName,
            natOp: parsed.natOp,
            verProc: parsed.verProc,
          },
        },
      });

      const importEvent = await tx.fiscalNfeDocumentEvent.create({
        data: {
          organization_id: input.organizationId,
          document_id: document.id,
          event_type: 'xml_import',
          event_status: 'accepted',
          sequence: 1,
          sefaz_status_code: parsed.sefazStatusCode,
          sefaz_status_message: parsed.sefazStatusMessage,
          protocol: parsed.authorizationProtocol,
          correlation_id: `import-${parsed.accessKey}`,
          request_summary: {
            fileName: input.fileName,
            source: 'api_upload',
          },
          response_summary: {
            status: parsed.status,
            direction,
          },
          triggered_by_user_id: input.triggeredByUserId ?? null,
          started_at: now,
          completed_at: now,
        },
        select: { id: true },
      });

      await tx.fiscalNfeDocumentTimeline.createMany({
        data: [
          {
            document_id: document.id,
            event_id: importEvent.id,
            source: 'api',
            title: 'XML importado',
            message: `Nota ${parsed.number} série ${parsed.series} registrada via upload.`,
            created_by_user_id: input.triggeredByUserId ?? null,
          },
          {
            document_id: document.id,
            event_id: importEvent.id,
            source: 'system',
            title: 'Documento criado',
            message: `Importação do arquivo ${input.fileName}.`,
            created_by_user_id: input.triggeredByUserId ?? null,
          },
        ],
      });

      const attachment = await tx.fiscalNfeDocumentAttachment.create({
        data: {
          document_id: document.id,
          event_id: importEvent.id,
          kind: attachmentKind,
          file_name: input.fileName,
          content_type: 'application/xml',
          storage_key: 'pending',
          content: xmlText,
          size_bytes: BigInt(input.xmlBuffer.length),
          checksum_sha256: checksumSha256,
        },
        select: { id: true },
      });

      await tx.fiscalNfeDocumentAttachment.update({
        where: { id: attachment.id },
        data: { storage_key: `inline:${attachment.id}` },
      });

      if (direction === 'inbound') {
        if (parsedDetail.itens.length > 0) {
          await tx.fiscalNfeDocumentItem.createMany({
            data: parsedDetail.itens.map((item) => ({
              document_id: document.id,
              line_number: item.item,
              prod_codigo: item.codigo,
              descricao: item.descricao,
              ncm: item.ncm,
              cfop: item.cfop,
              qty: String(item.quantidade),
              uom: item.unidade.trim() || 'UN',
              valor_total: String(item.valorTotal),
              x_ped: item.xPed ?? null,
              n_item_ped: item.nItemPed ?? null,
            })),
          });
        }

        await this.createInboundProcess(tx, document.id, parsed.accessKey);
      }

      return {
        documentId: document.id,
        attachmentId: attachment.id,
        direction,
      };
    });

    let postImportMode: ImportInboundDocumentResult['postImportMode'] =
      'not_applicable';
    if (txResult.direction === 'inbound') {
      const enqueueResult = await this.enqueuePostImport(txResult.documentId);
      postImportMode = enqueueResult.mode;
    }

    return {
      documentId: txResult.documentId,
      attachmentId: txResult.attachmentId,
      direction: txResult.direction,
      inboundStarted: txResult.direction === 'inbound',
      postImportMode,
    };
  }

  async runPostImportPipeline(
    documentId: string,
  ): Promise<PostImportPipelineResult> {
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null },
      select: {
        id: true,
        organization_id: true,
        direction: true,
        access_key: true,
        sefaz_status_code: true,
      },
    });

    if (!doc) {
      return {
        documentId,
        ran: false,
        skippedReason: 'document_not_found',
        pedidoValidation: null,
        businessValidation: null,
        deliveryCreated: false,
      };
    }

    if (doc.direction !== 'inbound') {
      return {
        documentId,
        ran: false,
        skippedReason: 'not_inbound',
        pedidoValidation: null,
        businessValidation: null,
        deliveryCreated: false,
      };
    }

    const process = await this.prisma.fiscalNfeInboundProcess.findFirst({
      where: { document_id: documentId, deleted_at: null },
      select: { inbound_status: true },
    });

    if (!process) {
      throw new NotFoundError('Processo inbound NFe não encontrado');
    }

    if (process.inbound_status === 'xml_imported') {
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'sefaz_validated',
        title: 'Validação SEFAZ concluída',
        message:
          doc.sefaz_status_code === '100'
            ? 'NF-e autorizada (protocolo XML).'
            : 'Validação registrada (stub — mensageria SEFAZ na fase 2).',
        source: 'sefaz',
        patchProcess: { sefaz_validated_at: new Date() },
      });
    }

    const pedidoValidation = await this.runPedidoValidation(documentId);
    let businessValidation: BusinessValidationRunResult | null = null;
    let deliveryCreated = false;
    if (pedidoValidation.matched) {
      const validationConfig = await this.resolveValidationStepConfig(documentId);
      businessValidation = await this.runBusinessValidations(
        documentId,
        validationConfig,
      );
      if (businessValidation.passed) {
        await this.runCreateDelivery(documentId);
        deliveryCreated = true;
      }
    }

    return {
      documentId,
      ran: true,
      pedidoValidation,
      businessValidation,
      deliveryCreated,
    };
  }

  async runPedidoValidation(documentId: string): Promise<PedidoValidationResult> {
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null, direction: 'inbound' },
      select: {
        id: true,
        organization_id: true,
        company_id: true,
        issuer_cnpj: true,
        recipient_document: true,
        issued_at: true,
        access_key: true,
        company: {
          select: {
            cnpj: true,
          },
        },
      },
    });

    if (!doc) {
      throw new NotFoundError('Documento NFe inbound não encontrado');
    }

    await this.transitionInboundStatus({
      organizationId: doc.organization_id,
      documentId,
      to: 'pedido_validating',
      eventType: 'pedido_validation',
      title: 'Validação pedido SAP iniciada',
      source: 'job',
      correlationId: doc.access_key ?? undefined,
    });

    const items = await this.prisma.fiscalNfeDocumentItem.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    const linesWithPedido = items.filter(
      (item) => item.x_ped?.trim() && item.n_item_ped?.trim(),
    );

    if (linesWithPedido.length === 0) {
      await this.prisma.fiscalNfeDocumentItem.updateMany({
        where: { document_id: documentId, deleted_at: null },
        data: {
          pedido_validation_status: 'alert',
          pedido_validation_message: 'Pedido de compra não informado no XML',
        },
      });

      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'pedido_alert',
        eventType: 'pedido_validation',
        title: 'Alerta - sem pedido SAP',
        message: 'Nenhum item possui xPed e nItemPed no XML.',
        source: 'job',
        patchProcess: {
          pedido_validated_at: new Date(),
          alert_code: 'NO_PURCHASE_ORDER',
          alert_message: 'NF sem referência de pedido de compra',
        },
      });

      return {
        documentId,
        matched: false,
        reason: 'no_purchase_order',
        lines: [],
      };
    }

    const branchCnpj =
      (doc.recipient_document ?? '').replace(/\D/g, '').length === 14
        ? (doc.recipient_document ?? '').replace(/\D/g, '')
        : doc.company.cnpj;

    const adapter = await this.sapInboundAdapterService.getAdapter({
      organizationId: doc.organization_id,
      integrationLog: {
        nfeDocumentId: documentId,
        correlationId: doc.access_key ?? undefined,
      },
    });

    let validationResult: Awaited<
      ReturnType<typeof adapter.validatePurchaseOrderLines>
    >;

    try {
      validationResult = await adapter.validatePurchaseOrderLines({
        cnpj: doc.issuer_cnpj,
        branchCnpj,
        issuedAt: doc.issued_at ?? new Date(),
        lines: linesWithPedido.map((line) => ({
          xPed: line.x_ped!.trim(),
          nItemPed: line.n_item_ped!.trim(),
          qty: Number(line.qty),
          materialCode: line.prod_codigo,
        })),
      });
    } catch (error) {
      const message = this.describeError(error);
      await this.prisma.fiscalNfeDocumentItem.updateMany({
        where: { document_id: documentId, deleted_at: null },
        data: {
          pedido_validation_status: 'alert',
          pedido_validation_message: message,
        },
      });

      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'pedido_alert',
        eventType: 'pedido_validation',
        title: 'Alerta - erro consulta SAP',
        message,
        source: 'sap',
        patchProcess: {
          pedido_validated_at: new Date(),
          alert_code: 'PO_SAP_ERROR',
          alert_message: message,
        },
      });

      return {
        documentId,
        matched: false,
        reason: 'sap_error',
        lines: [],
      };
    }

    const now = new Date();
    for (const item of items) {
      const lineResult = validationResult.lines.find(
        (line) =>
          line.xPed === (item.x_ped?.trim() ?? '') &&
          line.nItemPed === (item.n_item_ped?.trim() ?? ''),
      );
      const matched = lineResult?.matched ?? false;

      await this.prisma.fiscalNfeDocumentItem.update({
        where: { id: item.id },
        data: {
          pedido_validation_status: matched ? 'matched' : 'alert',
          pedido_validation_message: lineResult?.message ?? null,
          sap_order_number: lineResult?.sapOrderNumber ?? null,
          sap_order_item: lineResult?.sapOrderItem ?? null,
          updated_at: now,
        },
      });
    }

    const primaryOrder = validationResult.lines.find(
      (line) => line.sapOrderNumber,
    )?.sapOrderNumber;

    if (validationResult.allMatched) {
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'pedido_matched',
        eventType: 'pedido_validation',
        title: 'Pedido validado no SAP',
        message: primaryOrder
          ? `Pedido ${primaryOrder} conferido com sucesso.`
          : 'Pedidos conferidos com sucesso.',
        source: 'sap',
        responseSummary: {
          lines: validationResult.lines,
        },
        patchProcess: {
          pedido_validated_at: now,
          alert_code: null,
          alert_message: null,
        },
      });

      const dbItems = await this.prisma.fiscalNfeDocumentItem.findMany({
        where: {
          document_id: documentId,
          deleted_at: null,
          sap_order_number: { not: null },
        },
      });

      await this.persistSapDocuments(this.prisma, {
        documentId,
        documentType: 'purchase_order',
        lines: dbItems.map((item) => {
          const match = validationResult.lines.find(
            (line) =>
              line.xPed === (item.x_ped ?? '') &&
              line.nItemPed === (item.n_item_ped ?? ''),
          );
          return {
            docNumber: item.sap_order_number!,
            itemNumber: item.sap_order_item ?? match?.sapOrderItem,
            nfeItemId: item.id,
          };
        }),
      });

      if (primaryOrder) {
        await this.updateDocumentSapCache(this.prisma, documentId, {
          sapOrderId: primaryOrder,
        });
      }

      return {
        documentId,
        matched: true,
        primaryOrder,
        lines: validationResult.lines,
      };
    }

    await this.transitionInboundStatus({
      organizationId: doc.organization_id,
      documentId,
      to: 'pedido_alert',
      eventType: 'pedido_validation',
      title: 'Alerta - pedido não encontrado no SAP',
      source: 'sap',
      patchProcess: {
        pedido_validated_at: now,
        alert_code: 'PO_NOT_FOUND',
        alert_message: 'Um ou mais itens não possuem pedido válido no SAP',
      },
    });

    return {
      documentId,
      matched: false,
      reason: 'order_not_found',
      lines: validationResult.lines,
    };
  }

  async runBusinessValidations(
    documentId: string,
    configInput?: NfeValidationStepConfig,
  ): Promise<BusinessValidationRunResult> {
    const config = configInput ?? parseValidationStepConfig(undefined);
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null, direction: 'inbound' },
      select: {
        id: true,
        organization_id: true,
        company_id: true,
        issuer_cnpj: true,
        recipient_document: true,
        issued_at: true,
        access_key: true,
        total_amount: true,
        company: { select: { cnpj: true } },
      },
    });

    if (!doc) {
      throw new NotFoundError('Documento NFe inbound não encontrado');
    }

    const attachment = await this.prisma.fiscalNfeDocumentAttachment.findFirst({
      where: {
        document_id: documentId,
        deleted_at: null,
        content: { not: null },
      },
      orderBy: { created_at: 'desc' },
      select: { content: true },
    });

    if (!attachment?.content) {
      throw new ValidationError('nfe_xml_attachment_not_found');
    }

    const parsed = parseNfeXmlDetail(attachment.content);
    const branchCnpj =
      (doc.recipient_document ?? '').replace(/\D/g, '').length === 14
        ? (doc.recipient_document ?? '').replace(/\D/g, '')
        : doc.company.cnpj;

    const adapter = await this.sapInboundAdapterService.getAdapter({
      organizationId: doc.organization_id,
      integrationLog: {
        nfeDocumentId: documentId,
        correlationId: doc.access_key ?? undefined,
      },
    });

    let sapLines: SapPedidoCompraLine[] = [];
    try {
      sapLines = await adapter.fetchPurchaseOrderLines({
        cnpj: doc.issuer_cnpj,
        branchCnpj,
        issuedAt: doc.issued_at ?? new Date(),
      });
    } catch (error) {
      const message = this.describeError(error);
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'pedido_alert',
        eventType: 'pedido_validation',
        title: 'Alerta - erro validação SAP',
        message,
        source: 'sap',
        patchProcess: {
          alert_code: 'VALIDATION_SAP_ERROR',
          alert_message: message,
        },
      });
      return { documentId, passed: false, issues: [] };
    }

    const result = compareNfeWithSapPedido({
      config,
      issuerCnpj: doc.issuer_cnpj,
      totalAmount: Number(doc.total_amount),
      headerTaxes: parsed.impostos,
      items: mapParsedItemsForValidation(parsed.itens),
      sapLines: sapLines.map((line) => this.mapSapLineForValidation(line)),
    });

    await this.persistBusinessValidationResult({
      documentId,
      organizationId: doc.organization_id,
      accessKey: doc.access_key,
      result,
    });

    return {
      documentId,
      passed: result.passed,
      issues: result.issues,
    };
  }

  async runCreateDelivery(documentId: string): Promise<CreateDeliveryResult> {
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null, direction: 'inbound' },
      select: {
        id: true,
        organization_id: true,
        access_key: true,
        number: true,
        series: true,
        issued_at: true,
      },
    });

    if (!doc) {
      throw new NotFoundError('Documento NFe inbound não encontrado');
    }

    if (!doc.access_key) {
      throw new ValidationError('nfe_access_key_not_found');
    }

    await this.transitionInboundStatus({
      organizationId: doc.organization_id,
      documentId,
      to: 'delivery_creating',
      eventType: 'sap_delivery_create',
      title: 'Criando delivery no SAP',
      source: 'sap',
      correlationId: doc.access_key,
    });

    const items = await this.prisma.fiscalNfeDocumentItem.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    const orderRefs = items
      .filter((item) => item.sap_order_number && item.sap_order_item)
      .map((item) => ({
        sapOrderNumber: item.sap_order_number!,
        sapOrderItem: item.sap_order_item!,
        qty: Number(item.qty),
        materialCode: item.prod_codigo,
      }));

    if (orderRefs.length === 0) {
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'inbound_error',
        eventType: 'sap_delivery_create',
        title: 'Erro ao criar delivery no SAP',
        message: 'Nenhum item com pedido SAP validado para montar a delivery.',
        source: 'sap',
      });
      throw new DomainError('nfe_inbound_delivery_missing_order_refs');
    }

    const adapter = await this.sapInboundAdapterService.getAdapter({
      organizationId: doc.organization_id,
      integrationLog: {
        nfeDocumentId: documentId,
        correlationId: doc.access_key,
      },
    });

    try {
      const delivery = await adapter.createInboundDelivery({
        numero: String(doc.number),
        serie: String(doc.series),
        datadoc: formatSapDocDate(doc.issued_at ?? new Date()),
        nfeAccessKey: doc.access_key,
        orderRefs,
      });

      const itemByLine = new Map<number, string>();
      for (const item of items) {
        itemByLine.set(item.line_number, item.id);
      }

      const rawResponse = delivery.rawResponse ?? {
        deliverynumber: delivery.deliveryNumber,
        deliverynumbers: [delivery.deliveryNumber],
      };

      await this.persistSapDocuments(this.prisma, {
        documentId,
        documentType: 'inbound_delivery',
        lines: delivery.lines.map((line, index) => ({
          docNumber: line.docNumber,
          itemNumber: line.itemNumber,
          fiscalYear: line.fiscalYear,
          nfeItemId:
            (line.nfeItemLine != null
              ? itemByLine.get(line.nfeItemLine)
              : undefined) ?? items[index]?.id,
          rawResponse,
        })),
      });

      await this.updateDocumentSapCache(this.prisma, documentId, {
        sapDocumentId: delivery.deliveryNumber,
      });

      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'awaiting_portaria',
        eventType: 'sap_delivery_create',
        title: 'Delivery SAP criada - aguardando portaria',
        message: `Delivery ${delivery.deliveryNumber}. Confirme na portaria para liberar o MIGO.`,
        source: 'sap',
        responseSummary: {
          deliveryNumber: delivery.deliveryNumber,
          lines: delivery.lines,
          rawResponse,
        },
        patchProcess: {
          delivery_created_at: new Date(),
        },
      });

      return {
        documentId,
        deliveryNumber: delivery.deliveryNumber,
        fiscalYear: delivery.fiscalYear,
        inboundStatus: 'awaiting_portaria',
      };
    } catch (error) {
      const message = this.describeError(error);
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'inbound_error',
        eventType: 'sap_delivery_create',
        title: 'Erro ao criar delivery no SAP',
        message,
        source: 'sap',
      });
      throw this.normalizeError(error, 'nfe_inbound_delivery_error');
    }
  }

  async confirmPortaria(input: ConfirmPortariaInput): Promise<ConfirmPortariaResult> {
    const doc = await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);

    if (process.inbound_status !== 'awaiting_portaria') {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const delivery = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: {
        document_id: input.documentId,
        document_type: 'inbound_delivery',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    const deliveryNumber = delivery?.doc_number?.trim();
    if (!deliveryNumber) {
      throw new ValidationError('nfe_delivery_not_found');
    }

    const items = await this.prisma.fiscalNfeDocumentItem.findMany({
      where: { document_id: input.documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    const orderRefs = items
      .filter((item) => item.sap_order_number && item.sap_order_item)
      .map((item) => ({
        sapOrderNumber: item.sap_order_number!,
        sapOrderItem: item.sap_order_item!,
        qty: Number(item.qty),
        materialCode: item.prod_codigo,
      }));

    if (orderRefs.length === 0) {
      throw new ValidationError('nfe_delivery_order_refs_missing');
    }

    const adapter = await this.sapInboundAdapterService.getAdapter({
      organizationId: input.organizationId,
      integrationLog: {
        nfeDocumentId: input.documentId,
        correlationId: doc.access_key ?? doc.id,
      },
    });

    const portariaResult = await adapter.postInboundDeliveryPortaria({
      numero: String(doc.number),
      serie: String(doc.series),
      datadoc: formatSapDocDate(doc.issued_at ?? new Date()),
      delivery: deliveryNumber,
      orderRefs,
    });

    await this.persistSapDocuments(this.prisma, {
      documentId: input.documentId,
      documentType: 'goods_movement',
      lines: portariaResult.lines.map((line) => ({
        docNumber: portariaResult.migoNumber,
        itemNumber: line.itemNumber,
        fiscalYear: portariaResult.migoFiscalYear,
        rawResponse: portariaResult.rawResponse,
      })),
    });

    await this.updateDocumentSapCache(this.prisma, input.documentId, {
      sapDocumentId: portariaResult.migoNumber,
    });

    const now = new Date();
    await this.transitionInboundStatus({
      organizationId: input.organizationId,
      documentId: input.documentId,
      to: 'migo_done',
      eventType: 'portaria_confirmation',
      title: 'Caminhão confirmado na portaria',
      message: `Portaria confirmada. MIGO ${portariaResult.migoNumber} registrada no SAP.`,
      source: 'user',
      triggeredByUserId: input.userId,
      responseSummary: {
        deliveryNumber,
        migoNumber: portariaResult.migoNumber,
        migoFiscalYear: portariaResult.migoFiscalYear,
        rawResponse: portariaResult.rawResponse,
      },
      patchProcess: {
        portaria_confirmed_at: now,
        portaria_confirmed_by_user_id: input.userId,
        migo_completed_at: now,
      },
    });

    const miroEnqueue = await this.enqueueMiro(input.documentId);

    return {
      documentId: input.documentId,
      inboundStatus: 'migo_done',
      migoNumber: portariaResult.migoNumber,
      miroMode: miroEnqueue.mode,
    };
  }

  async registerMigo(input: RegisterMigoInput): Promise<RegisterMigoResult> {
    const doc = await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);

    if (process.inbound_status !== 'migo_pending') {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const delivery = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: {
        document_id: input.documentId,
        document_type: 'inbound_delivery',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    let migoNumber = input.migoNumber?.trim();
    let fiscalYear = input.fiscalYear?.trim();
    let accountingDocNumber = input.accountingDocNumber?.trim();

    if (input.useSapStub !== false && !migoNumber) {
      const stubAdapter = this.sapInboundAdapterService.getStubAdapter();
      const stubResult = await stubAdapter.postGoodsMovementMigo({
        deliveryNumber: delivery?.doc_number ?? doc.access_key ?? doc.id,
        fiscalYear: delivery?.fiscal_year ?? undefined,
      });

      migoNumber = stubResult.migoNumber;
      fiscalYear = stubResult.fiscalYear;
      accountingDocNumber = stubResult.accountingDocNumber;

      await this.persistSapDocuments(this.prisma, {
        documentId: input.documentId,
        documentType: 'goods_movement',
        lines: stubResult.lines.map((line) => ({
          docNumber: line.docNumber,
          itemNumber: line.itemNumber ?? input.migoItem,
          fiscalYear: line.fiscalYear,
          rawResponse: { migo: stubResult },
        })),
      });

      if (accountingDocNumber) {
        await this.persistSapDocuments(this.prisma, {
          documentId: input.documentId,
          documentType: 'accounting_doc',
          lines: [{ docNumber: accountingDocNumber, fiscalYear }],
        });
      }
    } else if (!migoNumber) {
      throw new ValidationError('migo_number_required');
    } else {
      await this.persistSapDocuments(this.prisma, {
        documentId: input.documentId,
        documentType: 'goods_movement',
        lines: [
          {
            docNumber: migoNumber,
            itemNumber: input.migoItem,
            fiscalYear,
          },
        ],
      });

      if (accountingDocNumber) {
        await this.persistSapDocuments(this.prisma, {
          documentId: input.documentId,
          documentType: 'accounting_doc',
          lines: [{ docNumber: accountingDocNumber, fiscalYear }],
        });
      }
    }

    await this.updateDocumentSapCache(this.prisma, input.documentId, {
      sapDocumentId: migoNumber,
    });

    await this.transitionInboundStatus({
      organizationId: input.organizationId,
      documentId: input.documentId,
      to: 'migo_done',
      eventType: 'sap_migo',
      title: 'Movimentação de material (MIGO) registrada',
      message: `MIGO ${migoNumber}`,
      source: 'user',
      triggeredByUserId: input.userId,
      patchProcess: {
        migo_completed_at: new Date(),
      },
    });

    const miroEnqueue = await this.enqueueMiro(input.documentId);

    return {
      documentId: input.documentId,
      inboundStatus: 'migo_done',
      migoNumber: migoNumber!,
      miroMode: miroEnqueue.mode,
    };
  }

  async runMiro(documentId: string): Promise<RunMiroResult> {
    const process = await this.prisma.fiscalNfeInboundProcess.findFirst({
      where: { document_id: documentId, deleted_at: null },
      select: { inbound_status: true },
    });

    if (!process) {
      return {
        documentId,
        processed: false,
        skippedReason: 'inbound_process_not_found',
      };
    }

    const runnableStatuses: NfeInboundStatus[] = ['migo_done', 'miro_pending'];
    if (
      !runnableStatuses.includes(process.inbound_status as NfeInboundStatus)
    ) {
      return {
        documentId,
        processed: false,
        skippedReason: 'invalid_status',
      };
    }

    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null, direction: 'inbound' },
      select: {
        id: true,
        organization_id: true,
        access_key: true,
        number: true,
        series: true,
        issued_at: true,
        total_amount: true,
      },
    });

    if (!doc) {
      return {
        documentId,
        processed: false,
        skippedReason: 'document_not_found',
      };
    }

    if (!doc.access_key) {
      throw new ValidationError('nfe_access_key_not_found');
    }

    const existingMiro = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: {
        document_id: documentId,
        document_type: 'invoice_verification',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (existingMiro?.doc_number) {
      if (process.inbound_status === 'miro_done') {
        return {
          documentId,
          processed: true,
          miroNumber: existingMiro.doc_number,
          fiscalYear: existingMiro.fiscal_year ?? undefined,
          inboundStatus: 'miro_done',
        };
      }

      if (
        process.inbound_status === 'miro_pending' ||
        process.inbound_status === 'migo_done'
      ) {
        await this.finalizeMiroFromExistingDocument({
          organizationId: doc.organization_id,
          documentId,
          existingMiro,
          currentStatus: process.inbound_status as NfeInboundStatus,
        });
        return {
          documentId,
          processed: true,
          miroNumber: existingMiro.doc_number,
          fiscalYear: existingMiro.fiscal_year ?? undefined,
          inboundStatus: 'miro_done',
        };
      }
    }

    const migo = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: {
        document_id: documentId,
        document_type: 'goods_movement',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    const items = await this.prisma.fiscalNfeDocumentItem.findMany({
      where: { document_id: documentId, deleted_at: null },
      orderBy: { line_number: 'asc' },
    });

    const miroAmountsByLine = await this.resolveMiroItemAmountsByLine(documentId);

    const orderRefs = items
      .filter((item) => item.sap_order_number && item.sap_order_item)
      .map((item) => ({
        sapOrderNumber: item.sap_order_number!,
        sapOrderItem: item.sap_order_item!,
        qty: Number(item.qty),
        itemAmount:
          miroAmountsByLine.get(item.line_number) ?? Number(item.valor_total),
        nfItem: item.line_number,
        nfUnit: item.uom?.trim() || 'UN',
        poUnit: item.uom?.trim() || 'UN',
      }));

    if (orderRefs.length === 0) {
      throw new ValidationError('nfe_miro_order_refs_missing');
    }

    if (process.inbound_status !== 'miro_pending') {
      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'miro_pending',
        eventType: 'sap_miro',
        title: 'Faturamento (MIRO) em processamento',
        source: 'job',
      });
    }

    const adapter = await this.sapInboundAdapterService.getAdapter({
      organizationId: doc.organization_id,
      integrationLog: {
        nfeDocumentId: documentId,
        correlationId: doc.access_key,
      },
    });

    try {
      const miro = await adapter.postInvoiceVerificationMiro({
        numero: String(doc.number),
        serie: String(doc.series),
        datadoc: doc.issued_at ?? new Date(),
        datalanc: new Date(),
        valorTotal: Number(doc.total_amount ?? 0),
        orderRefs,
        nfeAccessKey: doc.access_key,
        migoNumber: migo?.doc_number,
        fiscalYear: migo?.fiscal_year ?? undefined,
      });

      await this.persistSapDocuments(this.prisma, {
        documentId,
        documentType: 'invoice_verification',
        lines: miro.lines.map((line) => ({
          docNumber: line.docNumber,
          itemNumber: line.itemNumber,
          fiscalYear: line.fiscalYear,
          rawResponse: miro.rawResponse ?? { miro },
        })),
      });

      if (miro.accountingDocNumber) {
        await this.persistSapDocuments(this.prisma, {
          documentId,
          documentType: 'accounting_doc',
          lines: [
            {
              docNumber: miro.accountingDocNumber,
              fiscalYear: miro.fiscalYear,
            },
          ],
        });
      }

      await this.updateDocumentSapCache(this.prisma, documentId, {
        sapDocumentId: miro.miroNumber,
      });

      await this.transitionInboundStatus({
        organizationId: doc.organization_id,
        documentId,
        to: 'miro_done',
        eventType: 'sap_miro',
        title: 'Faturada (MIRO)',
        message: `MIRO ${miro.miroNumber}`,
        source: 'sap',
        responseSummary: {
          miroNumber: miro.miroNumber,
          fiscalYear: miro.fiscalYear,
          accountingDocNumber: miro.accountingDocNumber ?? null,
        },
        patchProcess: { miro_completed_at: new Date() },
      });

      return {
        documentId,
        processed: true,
        miroNumber: miro.miroNumber,
        fiscalYear: miro.fiscalYear,
        accountingDocNumber: miro.accountingDocNumber,
        inboundStatus: 'miro_done',
      };
    } catch (error) {
      const message = this.describeError(error);
      try {
        const current = await this.prisma.fiscalNfeInboundProcess.findFirst({
          where: { document_id: documentId, deleted_at: null },
          select: { inbound_status: true },
        });
        if (current?.inbound_status === 'miro_pending') {
          await this.transitionInboundStatus({
            organizationId: doc.organization_id,
            documentId,
            to: 'inbound_error',
            eventType: 'sap_miro',
            title: 'Erro ao processar MIRO',
            message,
            source: 'sap',
          });
        }
      } catch (transitionError) {
        this.logger.error(
          `Falha ao marcar inbound_error após MIRO para ${documentId}: ${this.describeError(transitionError)}`,
        );
      }
      throw this.normalizeError(error, 'nfe_inbound_miro_error');
    }
  }

  async rejectInbound(input: RejectInboundInput): Promise<RejectInboundResult> {
    if (!input.reason.trim()) {
      throw new ValidationError('nfe_inbound_rejection_reason_required');
    }

    await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);

    if (
      process.inbound_status === 'rejected_inbound' ||
      process.inbound_status === 'miro_done'
    ) {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const now = new Date();
    await this.transitionInboundStatus({
      organizationId: input.organizationId,
      documentId: input.documentId,
      to: 'rejected_inbound',
      eventType: 'inbound_rejection',
      title: 'NF-e rejeitada - não reconhecida',
      message: input.reason.trim(),
      source: 'user',
      triggeredByUserId: input.userId,
      patchProcess: {
        rejected_at: now,
        rejected_by_user_id: input.userId,
        rejection_reason: input.reason.trim(),
      },
    });

    const sequence = await this.nextEventSequence(this.prisma, input.documentId);
    await this.prisma.fiscalNfeDocumentEvent.create({
      data: {
        organization_id: input.organizationId,
        document_id: input.documentId,
        event_type: 'manifestation_not_performed',
        event_status: 'pending',
        sequence,
        sefaz_status_message: 'Manifestação de desconhecimento pendente (fase 2)',
        triggered_by_user_id: input.userId,
        started_at: now,
      },
    });

    return {
      documentId: input.documentId,
      inboundStatus: 'rejected_inbound',
    };
  }

  async retrySapStep(input: RetrySapStepInput): Promise<RetrySapStepResult> {
    await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);

    const status = process.inbound_status as NfeInboundStatus;
    const canRetry =
      status === 'inbound_error' ||
      status === 'pedido_alert' ||
      (status === 'miro_pending' && input.step === 'miro');

    if (!canRetry) {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const targetByStep: Record<RetrySapStepInput['step'], NfeInboundStatus> = {
      pedido: 'pedido_validating',
      delivery: 'delivery_creating',
      miro: 'miro_pending',
    };

    const targetStatus = targetByStep[input.step];

    if (input.step !== 'miro' || status !== 'miro_pending') {
      await this.transitionInboundStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        to: targetStatus,
        title: `Reprocessamento SAP: ${input.step}`,
        source: 'user',
        triggeredByUserId: input.userId,
      });
    }

    if (input.step === 'pedido') {
      const enqueue = await this.enqueuePostImport(input.documentId);
      return {
        documentId: input.documentId,
        step: input.step,
        targetStatus,
        mode: enqueue.mode,
      };
    }

    if (input.step === 'miro') {
      const enqueue = await this.enqueueMiro(input.documentId);
      return {
        documentId: input.documentId,
        step: input.step,
        targetStatus,
        mode: enqueue.mode,
      };
    }

    await this.runCreateDelivery(input.documentId);
    return {
      documentId: input.documentId,
      step: input.step,
      targetStatus,
      mode: 'inline',
    };
  }

  async reprocessInbound(input: ReprocessInboundInput): Promise<ReprocessInboundResult> {
    await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);

    const reprocessable = new Set<NfeInboundStatus>([
      'xml_imported',
      'inbound_error',
      'pedido_alert',
    ]);

    if (!reprocessable.has(process.inbound_status as NfeInboundStatus)) {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    if (process.inbound_status === 'inbound_error') {
      await this.transitionInboundStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        to: 'xml_imported',
        title: 'Reprocessamento inbound iniciado',
        source: 'user',
        triggeredByUserId: input.userId,
      });
    }

    if (input.runInline === true) {
      await this.runPostImportPipeline(input.documentId);
      return { documentId: input.documentId, mode: 'inline' };
    }

    const enqueue = await this.enqueuePostImport(input.documentId);
    return { documentId: input.documentId, mode: enqueue.mode };
  }

  async resetInboundDocument(
    input: ResetInboundInput,
  ): Promise<ResetInboundResult> {
    const doc = await this.loadInboundDocumentForOrganization(
      input.organizationId,
      input.documentId,
    );
    const process = await this.loadInboundProcess(input.documentId);
    const from = process.inbound_status as NfeInboundStatus;

    if (from === 'xml_imported') {
      throw new ValidationError('nfe_inbound_already_reset');
    }

    if (from === 'miro_done') {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const now = new Date();

    const removedSapDocuments = await this.prisma.$transaction(async (tx) => {
      const sapResult = await tx.fiscalNfeSapDocument.updateMany({
        where: { document_id: input.documentId, deleted_at: null },
        data: { deleted_at: now },
      });

      await tx.fiscalNfeDocumentItem.updateMany({
        where: { document_id: input.documentId, deleted_at: null },
        data: {
          pedido_validation_status: 'pending',
          pedido_validation_message: null,
          sap_order_number: null,
          sap_order_item: null,
          updated_at: now,
        },
      });

      await tx.fiscalNfeDocument.update({
        where: { id: input.documentId },
        data: {
          sap_document_id: null,
          sap_order_id: null,
          updated_at: now,
        },
      });

      await tx.fiscalNfeFlowInstance.updateMany({
        where: { document_id: input.documentId, deleted_at: null },
        data: { deleted_at: now },
      });

      await tx.fiscalNfeInboundProcess.update({
        where: { document_id: input.documentId },
        data: {
          inbound_status: 'xml_imported',
          status_changed_at: now,
          sefaz_validated_at: null,
          pedido_validated_at: null,
          delivery_created_at: null,
          portaria_confirmed_at: null,
          portaria_confirmed_by_user_id: null,
          migo_completed_at: null,
          miro_completed_at: null,
          rejected_at: null,
          rejected_by_user_id: null,
          rejection_reason: null,
          alert_code: null,
          alert_message: null,
          updated_at: now,
        },
      });

      const sequence = await this.nextEventSequence(tx, input.documentId);
      const event = await tx.fiscalNfeDocumentEvent.create({
        data: {
          organization_id: input.organizationId,
          document_id: input.documentId,
          event_type: 'inbound_status_change',
          event_status: 'accepted',
          sequence,
          correlation_id: doc.access_key ?? null,
          request_summary: { action: 'reset_inbound', from },
          response_summary: { to: 'xml_imported' },
          triggered_by_user_id: input.userId,
          started_at: now,
          completed_at: now,
        },
        select: { id: true },
      });

      await tx.fiscalNfeDocumentTimeline.create({
        data: {
          document_id: input.documentId,
          event_id: event.id,
          source: 'user',
          title: 'Documento resetado',
          message:
            'Processo inbound reiniciado. Documentos SAP removidos e status restaurado para importação XML.',
          created_by_user_id: input.userId,
        },
      });

      await this.publishInboundStatusChangedWebhook({
        organizationId: input.organizationId,
        documentId: input.documentId,
        from,
        to: 'xml_imported',
        eventId: event.id,
        correlationId: doc.access_key ?? null,
        source: 'user',
        triggeredByUserId: input.userId,
      });

      return sapResult.count;
    });

    return {
      documentId: input.documentId,
      inboundStatus: 'xml_imported',
      removedSapDocuments,
    };
  }

  async deleteDocumentCascade(
    input: DeleteDocumentCascadeInput,
  ): Promise<DeleteDocumentCascadeResult> {
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: {
        id: input.documentId,
        organization_id: input.organizationId,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!doc) {
      throw new NotFoundError('Documento NFe não encontrado');
    }

    if (this.queueService) {
      await this.queueService.removeJobsForDocument(input.documentId);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.cascadeDeleteNfeDocument(tx, input.documentId);
    });

    return { documentId: input.documentId };
  }

  private async cascadeDeleteNfeDocument(
    tx: Prisma.TransactionClient,
    documentId: string,
  ): Promise<void> {
    const flowInstances = await tx.fiscalNfeFlowInstance.findMany({
      where: { document_id: documentId },
      select: { id: true },
    });
    const instanceIds = flowInstances.map((instance) => instance.id);

    if (instanceIds.length > 0) {
      await tx.fiscalNfeFlowStepExecution.deleteMany({
        where: { instance_id: { in: instanceIds } },
      });
      await tx.fiscalNfeFlowInstance.deleteMany({
        where: { id: { in: instanceIds } },
      });
    }

    await tx.fiscalNfeSapDocument.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeDocumentAttachment.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeDocumentTimeline.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeDocumentEvent.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeDocumentItem.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeInboundProcess.deleteMany({
      where: { document_id: documentId },
    });
    await tx.fiscalNfeDocument.delete({
      where: { id: documentId },
    });
  }

  async enqueuePostImport(
    documentId: string,
  ): Promise<{ mode: 'queued' | 'inline' }> {
    if (this.queueService) {
      try {
        await this.queueService.enqueuePostImport(documentId);
        return { mode: 'queued' };
      } catch (error) {
        this.logger.warn(
          `Falha ao enfileirar post-import para ${documentId}; executando inline. Motivo: ${this.describeError(error)}`,
        );
      }
    }

    await this.runPostImportPipeline(documentId);
    return { mode: 'inline' };
  }

  async reconcileMiroStatus(documentId: string): Promise<void> {
    const process = await this.prisma.fiscalNfeInboundProcess.findFirst({
      where: { document_id: documentId, deleted_at: null },
      select: { inbound_status: true },
    });

    if (
      !process ||
      process.inbound_status === 'miro_done' ||
      (process.inbound_status !== 'miro_pending' &&
        process.inbound_status !== 'migo_done')
    ) {
      return;
    }

    const existingMiro = await this.prisma.fiscalNfeSapDocument.findFirst({
      where: {
        document_id: documentId,
        document_type: 'invoice_verification',
        status: 'success',
        deleted_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (!existingMiro?.doc_number) {
      return;
    }

    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null },
      select: { organization_id: true },
    });

    if (!doc) {
      return;
    }

    await this.finalizeMiroFromExistingDocument({
      organizationId: doc.organization_id,
      documentId,
      existingMiro,
      currentStatus: process.inbound_status as NfeInboundStatus,
    });
  }

  async enqueueMiro(documentId: string): Promise<{ mode: 'queued' | 'inline' }> {
    if (this.queueService) {
      try {
        await this.queueService.enqueueMiro(documentId);
        return { mode: 'queued' };
      } catch (error) {
        this.logger.warn(
          `Falha ao enfileirar MIRO para ${documentId}; executando inline. Motivo: ${this.describeError(error)}`,
        );
      }
    }

    await this.runMiro(documentId);
    return { mode: 'inline' };
  }

  private async finalizeMiroFromExistingDocument(input: {
    organizationId: string;
    documentId: string;
    existingMiro: { doc_number: string; fiscal_year: string | null };
    currentStatus: NfeInboundStatus;
  }): Promise<void> {
    await this.updateDocumentSapCache(this.prisma, input.documentId, {
      sapDocumentId: input.existingMiro.doc_number,
    });

    let status = input.currentStatus;

    if (status === 'migo_done') {
      await this.transitionInboundStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        to: 'miro_pending',
        eventType: 'sap_miro',
        title: 'Faturamento (MIRO) em processamento',
        source: 'system',
      });
      status = 'miro_pending';
    }

    if (status === 'miro_pending') {
      await this.transitionInboundStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        to: 'miro_done',
        eventType: 'sap_miro',
        title: 'Faturada (MIRO)',
        message: `MIRO ${input.existingMiro.doc_number}`,
        source: 'sap',
        patchProcess: { miro_completed_at: new Date() },
      });
    }
  }

  private async transitionInboundStatus(
    input: TransitionInboundStatusInput,
    tx?: DbClient,
  ): Promise<{
    from: NfeInboundStatus;
    to: NfeInboundStatus;
    changed: boolean;
    eventId: string | null;
  }> {
    const db = tx ?? this.prisma;
    const process = await db.fiscalNfeInboundProcess.findFirst({
      where: { document_id: input.documentId, deleted_at: null },
      select: { inbound_status: true },
    });

    if (!process) {
      throw new NotFoundError('Processo inbound NFe não encontrado');
    }

    const from = process.inbound_status as NfeInboundStatus;
    if (from === input.to) {
      return { from, to: input.to, changed: false, eventId: null };
    }

    if (!canTransitionInbound(from, input.to)) {
      throw new ValidationError('nfe_inbound_invalid_transition');
    }

    const now = new Date();
    const sequence = await this.nextEventSequence(db, input.documentId);
    const event = await db.fiscalNfeDocumentEvent.create({
      data: {
        organization_id: input.organizationId,
        document_id: input.documentId,
        event_type: input.eventType ?? 'inbound_status_change',
        event_status: 'accepted',
        sequence,
        correlation_id: input.correlationId ?? null,
        request_summary: input.requestSummary as Prisma.InputJsonValue | undefined,
        response_summary:
          input.responseSummary as Prisma.InputJsonValue | undefined,
        triggered_by_user_id: input.triggeredByUserId ?? null,
        started_at: now,
        completed_at: now,
      },
      select: { id: true },
    });

    await db.fiscalNfeDocumentTimeline.create({
      data: {
        document_id: input.documentId,
        event_id: event.id,
        source: input.source ?? 'system',
        title: input.title,
        message:
          input.message ??
          `${INBOUND_STATUS_LABELS[from]} -> ${INBOUND_STATUS_LABELS[input.to]}`,
        created_by_user_id: input.triggeredByUserId ?? null,
      },
    });

    await db.fiscalNfeInboundProcess.update({
      where: { document_id: input.documentId },
      data: {
        inbound_status: input.to,
        status_changed_at: now,
        ...(input.patchProcess ?? {}),
      },
    });

    await this.publishInboundStatusChangedWebhook({
      organizationId: input.organizationId,
      documentId: input.documentId,
      from,
      to: input.to,
      eventId: event.id,
      correlationId: input.correlationId ?? null,
      source: input.source ?? 'system',
      triggeredByUserId: input.triggeredByUserId ?? null,
    });

    return { from, to: input.to, changed: true, eventId: event.id };
  }

  private async persistSapDocuments(
    db: DbClient,
    input: {
      documentId: string;
      documentType:
        | 'purchase_order'
        | 'inbound_delivery'
        | 'goods_movement'
        | 'invoice_verification'
        | 'accounting_doc';
      lines: Array<{
        docNumber: string;
        itemNumber?: string;
        fiscalYear?: string;
        nfeItemId?: string;
        rawResponse?: Record<string, unknown>;
      }>;
    },
  ): Promise<void> {
    if (input.lines.length === 0) return;

    await db.fiscalNfeSapDocument.createMany({
      data: input.lines.map((line) => ({
        document_id: input.documentId,
        item_id: line.nfeItemId ?? null,
        document_type: input.documentType,
        doc_number: line.docNumber,
        item_number: line.itemNumber ?? null,
        fiscal_year: line.fiscalYear ?? null,
        status: 'success',
        raw_response: line.rawResponse as Prisma.InputJsonValue | undefined,
      })),
    });
  }

  private async updateDocumentSapCache(
    db: DbClient,
    documentId: string,
    patch: { sapDocumentId?: string; sapOrderId?: string },
  ): Promise<void> {
    if (!patch.sapDocumentId && !patch.sapOrderId) return;

    await db.fiscalNfeDocument.update({
      where: { id: documentId },
      data: {
        ...(patch.sapDocumentId ? { sap_document_id: patch.sapDocumentId } : {}),
        ...(patch.sapOrderId ? { sap_order_id: patch.sapOrderId } : {}),
      },
    });
  }

  private async createInboundProcess(
    db: DbClient,
    documentId: string,
    correlationId?: string,
  ) {
    return db.fiscalNfeInboundProcess.create({
      data: {
        document_id: documentId,
        inbound_status: 'xml_imported',
        correlation_id: correlationId ?? null,
      },
    });
  }

  private async publishInboundStatusChangedWebhook(input: {
    organizationId: string;
    documentId: string;
    from: NfeInboundStatus;
    to: NfeInboundStatus;
    eventId: string;
    correlationId: string | null;
    source: string;
    triggeredByUserId: string | null;
  }): Promise<void> {
    await this.domainEventPublisher.publish({
      organizationId: input.organizationId,
      aggregateType: 'nfe-inbound-process',
      aggregateId: input.documentId,
      eventType: 'nfe.inbound.status_changed' as WebhookEventType,
      payload: {
        documentId: input.documentId,
        eventId: input.eventId,
        fromStatus: input.from,
        toStatus: input.to,
        fromLabel: INBOUND_STATUS_LABELS[input.from],
        toLabel: INBOUND_STATUS_LABELS[input.to],
        correlationId: input.correlationId,
        source: input.source,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
  }

  private async nextEventSequence(db: DbClient, documentId: string): Promise<number> {
    const row = await db.fiscalNfeDocumentEvent.aggregate({
      where: { document_id: documentId, deleted_at: null },
      _max: { sequence: true },
    });
    return (row._max.sequence ?? 0) + 1;
  }

  private async assertAccessKeyNotDuplicate(accessKey: string): Promise<void> {
    const existing = await this.prisma.fiscalNfeDocument.findFirst({
      where: { access_key: accessKey, deleted_at: null },
      select: { id: true },
    });
    if (existing) {
      throw new ValidationError('nfe_document_duplicate');
    }
  }

  private async resolveCompany(
    organizationId: string,
    parsed: ParsedNfeXml,
    companyId?: string,
  ) {
    const recipientDocument = parsed.recipientDocument;
    const issuerDocument = parsed.issuerCnpj;
    const expectedDocuments = [recipientDocument, issuerDocument]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.replace(/\D/g, ''));
    const fallbackExpectedDocument = resolveOrganizationCompanyDocument(
      parsed,
    ).replace(/\D/g, '');

    if (companyId) {
      const company = await this.prisma.organizationCompany.findFirst({
        where: {
          id: companyId,
          organization_id: organizationId,
          deleted_at: null,
        },
        select: {
          id: true,
          cnpj: true,
        },
      });

      if (!company) {
        throw new NotFoundError('Empresa da organização não encontrada');
      }
      if (!expectedDocuments.includes(company.cnpj)) {
        throw new NotFoundError('Empresa incompatível com o XML importado');
      }
      return company;
    }

    const companies = await this.prisma.organizationCompany.findMany({
      where: {
        organization_id: organizationId,
        cnpj: { in: expectedDocuments },
        deleted_at: null,
      },
      select: {
        id: true,
        cnpj: true,
      },
      take: 2,
    });

    if (companies.length > 0) {
      const recipientMatch =
        recipientDocument != null
          ? companies.find(
              (company) => company.cnpj === recipientDocument.replace(/\D/g, ''),
            )
          : undefined;
      return recipientMatch ?? companies[0]!;
    }

    const fallbackCompany = await this.prisma.organizationCompany.findFirst({
      where: {
        organization_id: organizationId,
        cnpj: fallbackExpectedDocument,
        deleted_at: null,
      },
      select: {
        id: true,
        cnpj: true,
      },
    });

    if (!fallbackCompany) {
      throw new NotFoundError('Empresa da organização não encontrada no XML');
    }
    return fallbackCompany;
  }

  private resolveDirectionForOrganization(
    parsed: ParsedNfeXml,
    companyCnpj: string,
  ): 'inbound' | 'outbound' {
    if (parsed.recipientDocument && parsed.recipientDocument === companyCnpj) {
      return 'inbound';
    }
    if (parsed.issuerCnpj === companyCnpj) {
      return 'outbound';
    }
    return parsed.direction;
  }

  private async resolveMiroItemAmountsByLine(
    documentId: string,
  ): Promise<Map<number, number>> {
    const attachment = await this.prisma.fiscalNfeDocumentAttachment.findFirst({
      where: {
        document_id: documentId,
        deleted_at: null,
        content: { not: null },
      },
      orderBy: { created_at: 'desc' },
      select: { content: true },
    });

    if (!attachment?.content) {
      return new Map();
    }

    const detail = parseNfeXmlDetail(attachment.content);
    return new Map(detail.itens.map((item) => [item.item, item.itemAmount]));
  }

  private async loadInboundDocumentForOrganization(
    organizationId: string,
    documentId: string,
  ) {
    const row = await this.prisma.fiscalNfeDocument.findFirst({
      where: {
        id: documentId,
        organization_id: organizationId,
        direction: 'inbound',
        deleted_at: null,
      },
      select: {
        id: true,
        organization_id: true,
        access_key: true,
        number: true,
        series: true,
        issued_at: true,
      },
    });
    if (!row) {
      throw new NotFoundError('Documento NFe inbound não encontrado');
    }
    return row;
  }

  private async loadInboundProcess(documentId: string) {
    const process = await this.prisma.fiscalNfeInboundProcess.findFirst({
      where: { document_id: documentId, deleted_at: null },
    });
    if (!process) {
      throw new NotFoundError('Processo inbound NFe não encontrado');
    }
    return process;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private mapSapLineForValidation(line: SapPedidoCompraLine) {
    return {
      pedido: line.PEDIDO,
      item: line.ITEM,
      fornecedor: line.FORNECEDOR,
      nomeFornecedor: line.NOME_FORNECEDOR,
      quantidade: line.QTD_DISPONIVEL,
      valorBruto: line.VALOR_BRUTO,
      valorLiquido: line.VAL_DISPONIVEL,
      valorUnitario: line.VAL_UNIT,
      material: line.COD_SERV,
      impostos: line.IMPOSTOS,
    };
  }

  private async resolveValidationStepConfig(
    documentId: string,
  ): Promise<NfeValidationStepConfig> {
    const doc = await this.prisma.fiscalNfeDocument.findFirst({
      where: { id: documentId, deleted_at: null },
      select: { organization_id: true, company_id: true },
    });
    if (!doc?.company_id) {
      return parseValidationStepConfig(undefined);
    }

    const flow = await this.prisma.fiscalNfeFlowConfig.findFirst({
      where: {
        organization_id: doc.organization_id,
        company_id: doc.company_id,
        model: '55',
        status: 'published',
        active: true,
        deleted_at: null,
      },
      include: {
        steps: {
          where: { step_key: 'VALIDATIONS', deleted_at: null },
          take: 1,
        },
      },
    });

    const stepConfig = flow?.steps[0]?.config;
    return parseValidationStepConfig(
      stepConfig && typeof stepConfig === 'object' && !Array.isArray(stepConfig)
        ? (stepConfig as Record<string, unknown>)
        : undefined,
    );
  }

  private async persistBusinessValidationResult(input: {
    documentId: string;
    organizationId: string;
    accessKey: string | null;
    result: { passed: boolean; issues: ValidationIssue[] };
  }): Promise<void> {
    const now = new Date();
    const summary = input.result.issues
      .map((issue) => issue.message)
      .join('; ');

    for (const issue of input.result.issues) {
      if (issue.scope !== 'item' || !issue.xPed || !issue.nItemPed) continue;
      await this.prisma.fiscalNfeDocumentItem.updateMany({
        where: {
          document_id: input.documentId,
          deleted_at: null,
          x_ped: issue.xPed,
          n_item_ped: issue.nItemPed,
        },
        data: {
          pedido_validation_status: input.result.passed ? 'matched' : 'alert',
          pedido_validation_message: issue.message,
          updated_at: now,
        },
      });
    }

    if (input.result.passed) {
      await this.transitionInboundStatus({
        organizationId: input.organizationId,
        documentId: input.documentId,
        to: 'pedido_matched',
        eventType: 'pedido_validation',
        title: 'Validações de negócio concluídas',
        message: 'Valores, quantidades e impostos conferidos com o pedido SAP.',
        source: 'sap',
        responseSummary: { issues: input.result.issues },
        correlationId: input.accessKey ?? undefined,
        patchProcess: {
          alert_code: null,
          alert_message: null,
        },
      });
      return;
    }

    await this.transitionInboundStatus({
      organizationId: input.organizationId,
      documentId: input.documentId,
      to: 'pedido_alert',
      eventType: 'pedido_validation',
      title: 'Alerta - divergência na validação',
      message: summary || 'Divergência entre XML e pedido SAP.',
      source: 'sap',
      responseSummary: { issues: input.result.issues },
      correlationId: input.accessKey ?? undefined,
      patchProcess: {
        pedido_validated_at: now,
        alert_code: 'VALIDATION_DIVERGENCE',
        alert_message: summary || 'Divergência entre XML e pedido SAP',
      },
    });
  }

  private normalizeError(error: unknown, fallbackCode: string): DomainError {
    if (error instanceof DomainError) return error;
    if (error instanceof Error) {
      return new DomainError(`${fallbackCode}:${error.message}`);
    }
    return new DomainError(fallbackCode);
  }
}
