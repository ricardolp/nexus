import {
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
  NfeDocumentEvent,
  NfeDocumentItem,
  NfeDocumentTimeline,
  NfeInboundProcess,
  NfeNumberRange,
  NfeNumberRangeEvent,
  NfeSapDocument,
  NfseDocument,
  mapInboundToStatusInterno,
  NfseDocumentAttachment,
  NfseDocumentEvent,
  NfseDocumentItem,
  NfseDocumentTimeline,
  NfseInboundProcess,
  NfseNumberRange,
  NfseNumberRangeEvent,
  NfseSapDocument,
} from '@nexus/fiscal';

export function serializeNfeDocument(document: NfeDocument) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    companyId: document.companyId,
    direction: document.direction,
    environment: document.environment,
    status: document.status,
    model: document.model,
    series: document.series,
    number: document.number,
    accessKey: document.accessKey ?? null,
    issuerCnpj: document.issuerCnpj,
    issuerName: document.issuerName ?? null,
    recipientDocument: document.recipientDocument ?? null,
    recipientName: document.recipientName ?? null,
    totalAmount: document.totalAmount ?? null,
    issuedAt: document.issuedAt ?? null,
    authorizedAt: document.authorizedAt ?? null,
    cancelledAt: document.cancelledAt ?? null,
    authorizationProtocol: document.authorizationProtocol ?? null,
    cancellationProtocol: document.cancellationProtocol ?? null,
    sefazStatusCode: document.sefazStatusCode ?? null,
    sefazStatusMessage: document.sefazStatusMessage ?? null,
    sapDocumentId: document.sapDocumentId ?? null,
    sapOrderId: document.sapOrderId ?? null,
    idempotencyKey: document.idempotencyKey ?? null,
    metadata: document.metadata ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function serializeNfeDocumentListItem(
  document: NfeDocument,
  inboundProcess?: NfeInboundProcess | null,
) {
  const base = serializeNfeDocument(document);
  if (!inboundProcess) {
    return {
      ...base,
      inboundStatus: null,
      statusInterno: null,
      alertCode: null,
      alertMessage: null,
    };
  }

  return {
    ...base,
    inboundStatus: inboundProcess.inboundStatus,
    statusInterno: mapInboundToStatusInterno(inboundProcess.inboundStatus),
    alertCode: inboundProcess.alertCode ?? null,
    alertMessage: inboundProcess.alertMessage ?? null,
  };
}

export function serializeNfseDocument(document: NfseDocument) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    companyId: document.companyId,
    direction: document.direction,
    environment: document.environment,
    status: document.status,
    model: document.model,
    series: document.series,
    number: document.number,
    accessKey: document.accessKey ?? null,
    issuerCnpj: document.issuerCnpj,
    recipientDocument: document.recipientDocument ?? null,
    recipientName: document.recipientName ?? null,
    totalAmount: document.totalAmount ?? null,
    issuedAt: document.issuedAt ?? null,
    authorizedAt: document.authorizedAt ?? null,
    cancelledAt: document.cancelledAt ?? null,
    authorizationProtocol: document.authorizationProtocol ?? null,
    cancellationProtocol: document.cancellationProtocol ?? null,
    prefeituraStatusCode: document.prefeituraStatusCode ?? null,
    prefeituraStatusMessage: document.prefeituraStatusMessage ?? null,
    sapDocumentId: document.sapDocumentId ?? null,
    sapOrderId: document.sapOrderId ?? null,
    idempotencyKey: document.idempotencyKey ?? null,
    metadata: document.metadata ?? null,
    rpsNumber: document.rpsNumber ?? null,
    rpsSeries: document.rpsSeries ?? null,
    verificationCode: document.verificationCode ?? null,
    serviceCode: document.serviceCode ?? null,
    municipalityCode: document.municipalityCode ?? null,
    issRetained: document.issRetained ?? null,
    serviceDescription: document.serviceDescription ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export function serializeNfeDocumentEvent(event: NfeDocumentEvent) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    documentId: event.documentId,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    sequence: event.sequence,
    sefazStatusCode: event.sefazStatusCode ?? null,
    sefazStatusMessage: event.sefazStatusMessage ?? null,
    protocol: event.protocol ?? null,
    correlationId: event.correlationId ?? null,
    requestSummary: event.requestSummary ?? null,
    responseSummary: event.responseSummary ?? null,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
    triggeredByUserId: event.triggeredByUserId ?? null,
    startedAt: event.startedAt ?? null,
    completedAt: event.completedAt ?? null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function serializeNfseDocumentEvent(event: NfseDocumentEvent) {
  return {
    id: event.id,
    organizationId: event.organizationId,
    documentId: event.documentId,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    sequence: event.sequence,
    prefeituraStatusCode: event.prefeituraStatusCode ?? null,
    prefeituraStatusMessage: event.prefeituraStatusMessage ?? null,
    protocol: event.protocol ?? null,
    correlationId: event.correlationId ?? null,
    requestSummary: event.requestSummary ?? null,
    responseSummary: event.responseSummary ?? null,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
    triggeredByUserId: event.triggeredByUserId ?? null,
    startedAt: event.startedAt ?? null,
    completedAt: event.completedAt ?? null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function serializeNfeNumberRange(range: NfeNumberRange) {
  return {
    id: range.id,
    organizationId: range.organizationId,
    companyId: range.companyId,
    environment: range.environment,
    model: range.model,
    series: range.series,
    numberFrom: range.numberFrom,
    numberTo: range.numberTo,
    justification: range.justification ?? null,
    protocol: range.protocol ?? null,
    authorizedAt: range.authorizedAt ?? null,
    createdAt: range.createdAt,
    updatedAt: range.updatedAt,
  };
}

export function serializeNfseNumberRange(range: NfseNumberRange) {
  return {
    id: range.id,
    organizationId: range.organizationId,
    companyId: range.companyId,
    environment: range.environment,
    model: range.model,
    series: range.series,
    numberFrom: range.numberFrom,
    numberTo: range.numberTo,
    justification: range.justification ?? null,
    protocol: range.protocol ?? null,
    authorizedAt: range.authorizedAt ?? null,
    createdAt: range.createdAt,
    updatedAt: range.updatedAt,
  };
}

export function serializeNfeNumberRangeEvent(event: NfeNumberRangeEvent) {
  return {
    id: event.id,
    numberRangeId: event.numberRangeId,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    sefazStatusCode: event.sefazStatusCode ?? null,
    sefazStatusMessage: event.sefazStatusMessage ?? null,
    protocol: event.protocol ?? null,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function serializeNfseNumberRangeEvent(event: NfseNumberRangeEvent) {
  return {
    id: event.id,
    numberRangeId: event.numberRangeId,
    eventType: event.eventType,
    eventStatus: event.eventStatus,
    prefeituraStatusCode: event.prefeituraStatusCode ?? null,
    prefeituraStatusMessage: event.prefeituraStatusMessage ?? null,
    protocol: event.protocol ?? null,
    errorCode: event.errorCode ?? null,
    errorMessage: event.errorMessage ?? null,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function serializeNfeDocumentTimeline(item: NfeDocumentTimeline) {
  return {
    id: item.id,
    documentId: item.documentId,
    eventId: item.eventId ?? null,
    source: item.source,
    title: item.title,
    message: item.message ?? null,
    metadata: item.metadata ?? null,
    createdByUserId: item.createdByUserId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfseDocumentTimeline(item: NfseDocumentTimeline) {
  return {
    id: item.id,
    documentId: item.documentId,
    eventId: item.eventId ?? null,
    source: item.source,
    title: item.title,
    message: item.message ?? null,
    metadata: item.metadata ?? null,
    createdByUserId: item.createdByUserId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfeDocumentAttachment(item: NfeDocumentAttachment) {
  return {
    id: item.id,
    documentId: item.documentId,
    eventId: item.eventId ?? null,
    kind: item.kind,
    fileName: item.fileName,
    contentType: item.contentType ?? null,
    storageKey: item.storageKey,
    content: item.content ?? null,
    sizeBytes: item.sizeBytes ?? null,
    checksumSha256: item.checksumSha256 ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfseDocumentAttachment(item: NfseDocumentAttachment) {
  return {
    id: item.id,
    documentId: item.documentId,
    eventId: item.eventId ?? null,
    kind: item.kind,
    fileName: item.fileName,
    contentType: item.contentType ?? null,
    storageKey: item.storageKey,
    content: item.content ?? null,
    sizeBytes: item.sizeBytes ?? null,
    checksumSha256: item.checksumSha256 ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfeDocumentItem(item: NfeDocumentItem) {
  return {
    id: item.id,
    documentId: item.documentId,
    lineNumber: item.lineNumber,
    prodCodigo: item.prodCodigo,
    descricao: item.descricao,
    ncm: item.ncm,
    cfop: item.cfop,
    qty: item.qty,
    uom: item.uom,
    valorTotal: item.valorTotal,
    xPed: item.xPed ?? null,
    nItemPed: item.nItemPed ?? null,
    pedidoValidationStatus: item.pedidoValidationStatus,
    pedidoValidationMessage: item.pedidoValidationMessage ?? null,
    sapOrderNumber: item.sapOrderNumber ?? null,
    sapOrderItem: item.sapOrderItem ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfseDocumentItem(item: NfseDocumentItem) {
  return {
    id: item.id,
    documentId: item.documentId,
    lineNumber: item.lineNumber,
    prodCodigo: item.prodCodigo,
    descricao: item.descricao,
    serviceCode: item.serviceCode,
    municipalityCode: item.municipalityCode,
    qty: item.qty,
    uom: item.uom,
    valorTotal: item.valorTotal,
    xPed: item.xPed ?? null,
    nItemPed: item.nItemPed ?? null,
    pedidoValidationStatus: item.pedidoValidationStatus,
    pedidoValidationMessage: item.pedidoValidationMessage ?? null,
    sapOrderNumber: item.sapOrderNumber ?? null,
    sapOrderItem: item.sapOrderItem ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfeInboundProcess(item: NfeInboundProcess) {
  return {
    id: item.id,
    documentId: item.documentId,
    inboundStatus: item.inboundStatus,
    statusChangedAt: item.statusChangedAt,
    sefazValidatedAt: item.sefazValidatedAt ?? null,
    pedidoValidatedAt: item.pedidoValidatedAt ?? null,
    deliveryCreatedAt: item.deliveryCreatedAt ?? null,
    portariaConfirmedAt: item.portariaConfirmedAt ?? null,
    portariaConfirmedByUserId: item.portariaConfirmedByUserId ?? null,
    migoCompletedAt: item.migoCompletedAt ?? null,
    miroCompletedAt: item.miroCompletedAt ?? null,
    rejectedAt: item.rejectedAt ?? null,
    rejectedByUserId: item.rejectedByUserId ?? null,
    rejectionReason: item.rejectionReason ?? null,
    alertCode: item.alertCode ?? null,
    alertMessage: item.alertMessage ?? null,
    correlationId: item.correlationId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfseInboundProcess(item: NfseInboundProcess) {
  return {
    id: item.id,
    documentId: item.documentId,
    inboundStatus: item.inboundStatus,
    statusChangedAt: item.statusChangedAt,
    prefeituraValidatedAt: item.prefeituraValidatedAt ?? null,
    pedidoValidatedAt: item.pedidoValidatedAt ?? null,
    deliveryCreatedAt: item.deliveryCreatedAt ?? null,
    portariaConfirmedAt: item.portariaConfirmedAt ?? null,
    portariaConfirmedByUserId: item.portariaConfirmedByUserId ?? null,
    migoCompletedAt: item.migoCompletedAt ?? null,
    miroCompletedAt: item.miroCompletedAt ?? null,
    rejectedAt: item.rejectedAt ?? null,
    rejectedByUserId: item.rejectedByUserId ?? null,
    rejectionReason: item.rejectionReason ?? null,
    alertCode: item.alertCode ?? null,
    alertMessage: item.alertMessage ?? null,
    correlationId: item.correlationId ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfeSapDocument(item: NfeSapDocument) {
  return {
    id: item.id,
    documentId: item.documentId,
    itemId: item.itemId ?? null,
    documentType: item.documentType,
    docNumber: item.docNumber,
    itemNumber: item.itemNumber ?? null,
    fiscalYear: item.fiscalYear ?? null,
    status: item.status,
    rawResponse: item.rawResponse ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeNfseSapDocument(item: NfseSapDocument) {
  return {
    id: item.id,
    documentId: item.documentId,
    itemId: item.itemId ?? null,
    documentType: item.documentType,
    docNumber: item.docNumber,
    itemNumber: item.itemNumber ?? null,
    fiscalYear: item.fiscalYear ?? null,
    status: item.status,
    rawResponse: item.rawResponse ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export type FiscalOperationContext = {
  source?: 'app' | 'integration';
  integrationTokenId?: string;
};

export type CreateNfeDocumentInput = {
  direction: FiscalDocumentDirection;
  companyId: string;
  environment: FiscalNfeEnvironment;
  series: number;
  number: number;
  issuerCnpj: string;
  model?: string;
};

export type CreateNfseDocumentInput = {
  direction: FiscalDocumentDirection;
  companyId: string;
  environment: FiscalNfseEnvironment;
  series: number;
  number: number;
  issuerCnpj: string;
  model?: string;
};
