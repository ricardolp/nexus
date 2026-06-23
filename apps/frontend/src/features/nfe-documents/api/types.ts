export type NfeDocumentDirection = 'inbound' | 'outbound';
export type NfeDocumentStatus =
  | 'draft'
  | 'processing'
  | 'authorized'
  | 'rejected'
  | 'cancelled';
export type NfeEnvironment = 'production' | 'homologation';

export type NfeInboundStatus =
  | 'xml_imported'
  | 'sefaz_validated'
  | 'pedido_validating'
  | 'pedido_matched'
  | 'pedido_alert'
  | 'delivery_creating'
  | 'delivery_created'
  | 'awaiting_portaria'
  | 'migo_pending'
  | 'migo_done'
  | 'miro_pending'
  | 'miro_done'
  | 'rejected_inbound'
  | 'inbound_error';

export type StatusInterno =
  | 'inbound'
  | 'validada'
  | 'entrada'
  | 'mov_material'
  | 'faturada'
  | 'alerta'
  | 'rejeitada'
  | 'erro';

export interface NfeDocumentListItem {
  id: string;
  organizationId: string;
  companyId: string;
  direction: NfeDocumentDirection;
  environment: NfeEnvironment;
  status: NfeDocumentStatus;
  model: string;
  series: number;
  number: number;
  accessKey: string | null;
  issuerCnpj: string;
  issuerName: string | null;
  recipientDocument: string | null;
  recipientName: string | null;
  totalAmount: string | null;
  issuedAt: string | null;
  authorizedAt: string | null;
  cancelledAt: string | null;
  authorizationProtocol: string | null;
  sefazStatusCode: string | null;
  sefazStatusMessage: string | null;
  sapDocumentId: string | null;
  sapOrderId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  inboundStatus: NfeInboundStatus | null;
  statusInterno: StatusInterno | null;
  alertCode: string | null;
  alertMessage: string | null;
}

export interface NfeDocumentsListResponse {
  items: NfeDocumentListItem[];
  page: number;
  perPage: number;
  total: number;
}

export interface NfeDocumentsSummary {
  total: { count: number; amount: string };
  inbound: { count: number; amount: string };
  outbound: { count: number; amount: string };
  faturadas: { count: number; amount: string };
  pendentes: { count: number; amount: string };
  alertasErros: { count: number; amount: string };
}

export interface NfeDocumentListFilters {
  page?: number;
  perPage?: number;
  direction?: NfeDocumentDirection | 'all';
  search?: string;
  inboundStatus?: NfeInboundStatus;
  companyId?: string;
}

export interface NfeInboundProcess {
  id: string;
  documentId: string;
  inboundStatus: NfeInboundStatus;
  statusChangedAt: string;
  sefazValidatedAt: string | null;
  pedidoValidatedAt: string | null;
  deliveryCreatedAt: string | null;
  portariaConfirmedAt: string | null;
  portariaConfirmedByUserId: string | null;
  migoCompletedAt: string | null;
  miroCompletedAt: string | null;
  rejectedAt: string | null;
  rejectedByUserId: string | null;
  rejectionReason: string | null;
  alertCode: string | null;
  alertMessage: string | null;
  correlationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NfeDocumentItem {
  id: string;
  documentId: string;
  lineNumber: number;
  prodCodigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  qty: string | null;
  uom: string | null;
  valorTotal: string | null;
  xPed: string | null;
  nItemPed: string | null;
  pedidoValidationStatus: 'pending' | 'matched' | 'alert' | 'skipped';
  pedidoValidationMessage: string | null;
  sapOrderNumber: string | null;
  sapOrderItem: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NfeDocumentEvent {
  id: string;
  documentId: string;
  eventType: string;
  eventStatus: string;
  sequence: number;
  sefazStatusCode: string | null;
  sefazStatusMessage: string | null;
  protocol: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface NfeDocumentTimeline {
  id: string;
  documentId: string;
  title: string;
  message: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  triggeredByUserId: string | null;
  createdAt: string;
}

export interface NfeDocumentAttachment {
  id: string;
  documentId: string;
  kind: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export type NfeSapDocumentType =
  | 'purchase_order'
  | 'inbound_delivery'
  | 'goods_movement'
  | 'invoice_verification'
  | 'accounting_doc';

export interface NfeSapDocument {
  id: string;
  documentId: string;
  documentType: NfeSapDocumentType;
  docNumber: string;
  itemNumber: string | null;
  fiscalYear: string | null;
  status: string;
  rawResponse: Record<string, unknown> | null;
  createdAt: string;
}

export interface NfeFlowStepExecution {
  id: string;
  stepKey: string;
  status: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NfeFlowInstance {
  id: string;
  documentId: string;
  model: string;
  status: string;
  currentStepId: string | null;
  startedAt: string;
  finishedAt: string | null;
  executions: NfeFlowStepExecution[];
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
}

export interface ImportNfeDocumentPayload {
  file: File;
  companyId?: string;
}

export interface ImportNfeDocumentResponse {
  documentId: string;
  attachmentId: string;
  direction: NfeDocumentDirection;
  inboundStarted: boolean;
  postImportMode: string;
}

export interface RegisterMigoPayload {
  migoNumber?: string;
  migoItem?: string;
  fiscalYear?: string;
  accountingDocNumber?: string;
  useSapStub?: boolean;
}

export type SapRetryStep = 'pedido' | 'delivery' | 'miro';
