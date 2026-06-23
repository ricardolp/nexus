import { notInArray } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { organizationCompanies, users } from "./schema.js";

export const nfeDirectionEnum = pgEnum("nfe_direction", ["outbound", "inbound"]);

export const nfeEnvironmentEnum = pgEnum("nfe_environment", ["production", "homologation"]);

export const nfeDocumentStatusEnum = pgEnum("nfe_document_status", [
  "draft",
  "received",
  "validating",
  "validation_error",
  "waiting_processing",
  "sent_to_sefaz",
  "authorized",
  "rejected",
  "denied",
  "cancel_requested",
  "cancelled",
  "cancel_rejected",
  "inutilized",
  "processing_error",
  "contingency",
  "closed",
]);

export const nfeEventTypeEnum = pgEnum("nfe_event_type", [
  "authorization",
  "cancellation",
  "cancellation_denied",
  "correction_letter",
  "manifestation_confirmation",
  "manifestation_unknown",
  "manifestation_not_performed",
  "manifestation_awareness",
  "epec",
  "protocol_query",
  "status_query",
  "distribution_dfe",
  "xml_import",
  "xml_export",
  "system_status_change",
  "webhook_callback",
  "sap_callback",
  "manual_note",
  "inbound_status_change",
  "pedido_validation",
  "sap_delivery_create",
  "sap_migo",
  "sap_miro",
  "inbound_rejection",
  "portaria_confirmation",
]);

export const nfeInboundStatusEnum = pgEnum("nfe_inbound_status", [
  "xml_imported",
  "sefaz_validated",
  "pedido_validating",
  "pedido_matched",
  "pedido_alert",
  "delivery_creating",
  "delivery_created",
  "awaiting_portaria",
  "migo_pending",
  "migo_done",
  "miro_pending",
  "miro_done",
  "rejected_inbound",
  "inbound_error",
]);

export const nfePedidoValidationStatusEnum = pgEnum("nfe_pedido_validation_status", [
  "pending",
  "matched",
  "alert",
  "skipped",
]);

export const nfeSapDocumentTypeEnum = pgEnum("nfe_sap_document_type", [
  "purchase_order",
  "inbound_delivery",
  "goods_movement",
  "invoice_verification",
  "accounting_doc",
]);

export const nfeSapDocumentStatusEnum = pgEnum("nfe_sap_document_status", [
  "pending",
  "success",
  "error",
]);

export const nfeEventStatusEnum = pgEnum("nfe_event_status", [
  "pending",
  "sent",
  "accepted",
  "rejected",
  "error",
  "ignored",
]);

export const nfeTimelineSourceEnum = pgEnum("nfe_timeline_source", [
  "system",
  "user",
  "sefaz",
  "sap",
  "webhook",
  "job",
  "api",
]);

export const nfeAttachmentKindEnum = pgEnum("nfe_attachment_kind", [
  "xml_request",
  "xml_response",
  "xml_authorized",
  "xml_cancel",
  "xml_correction_letter",
  "xml_distribution",
  "danfe_pdf",
  "event_pdf",
  "json_payload",
  "txt_log",
  "other",
]);

export const nfeNumberRangeEventTypeEnum = pgEnum("nfe_number_range_event_type", [
  "inutilization_requested",
  "inutilization_authorized",
  "inutilization_rejected",
  "status_query",
  "manual_note",
]);

export const nfeDocuments = pgTable(
  "nfe_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    direction: nfeDirectionEnum("direction").notNull(),
    environment: nfeEnvironmentEnum("environment").notNull(),
    status: nfeDocumentStatusEnum("status").notNull().default("draft"),
    model: varchar("model", { length: 2 }).notNull().default("55"),
    series: integer("series").notNull(),
    number: integer("number").notNull(),
    accessKey: varchar("access_key", { length: 44 }),
    issuerCnpj: varchar("issuer_cnpj", { length: 14 }).notNull(),
    recipientDocument: varchar("recipient_document", { length: 14 }),
    recipientName: varchar("recipient_name", { length: 300 }),
    totalAmount: numeric("total_amount", { precision: 15, scale: 2 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    authorizationProtocol: varchar("authorization_protocol", { length: 20 }),
    cancellationProtocol: varchar("cancellation_protocol", { length: 20 }),
    sefazStatusCode: varchar("sefaz_status_code", { length: 10 }),
    sefazStatusMessage: text("sefaz_status_message"),
    sapDocumentId: varchar("sap_document_id", { length: 128 }),
    sapOrderId: varchar("sap_order_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyStatusIdx: index("nfe_documents_company_id_status_idx").on(
      table.organizationCompanyId,
      table.status
    ),
    companyDirectionEnvIdx: index("nfe_documents_company_id_direction_env_idx").on(
      table.organizationCompanyId,
      table.direction,
      table.environment
    ),
    accessKeyUnique: uniqueIndex("nfe_documents_access_key_unique").on(table.accessKey),
    companyIdempotencyUnique: uniqueIndex("nfe_documents_company_id_idempotency_key_unique").on(
      table.organizationCompanyId,
      table.idempotencyKey
    ),
    activeNumberUnique: uniqueIndex("nfe_documents_company_active_number_unique")
      .on(
        table.organizationCompanyId,
        table.model,
        table.series,
        table.number,
        table.environment
      )
      .where(notInArray(table.status, ["cancelled", "inutilized"])),
  })
);

export const nfeDocumentEvents = pgTable(
  "nfe_document_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeDocumentId: uuid("nfe_document_id")
      .notNull()
      .references(() => nfeDocuments.id, { onDelete: "cascade" }),
    eventType: nfeEventTypeEnum("event_type").notNull(),
    eventStatus: nfeEventStatusEnum("event_status").notNull().default("pending"),
    sequence: integer("sequence").notNull(),
    sefazStatusCode: varchar("sefaz_status_code", { length: 10 }),
    sefazStatusMessage: text("sefaz_status_message"),
    protocol: varchar("protocol", { length: 20 }),
    correlationId: varchar("correlation_id", { length: 128 }),
    requestSummary: jsonb("request_summary"),
    responseSummary: jsonb("response_summary"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentCreatedAtIdx: index("nfe_document_events_document_id_created_at_idx").on(
      table.nfeDocumentId,
      table.createdAt
    ),
    documentEventTypeIdx: index("nfe_document_events_document_id_event_type_idx").on(
      table.nfeDocumentId,
      table.eventType
    ),
  })
);

export const nfeDocumentTimeline = pgTable(
  "nfe_document_timeline",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeDocumentId: uuid("nfe_document_id")
      .notNull()
      .references(() => nfeDocuments.id, { onDelete: "cascade" }),
    nfeDocumentEventId: uuid("nfe_document_event_id").references(() => nfeDocumentEvents.id, {
      onDelete: "set null",
    }),
    source: nfeTimelineSourceEnum("source").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    message: text("message"),
    metadata: jsonb("metadata"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentCreatedAtIdx: index("nfe_document_timeline_document_id_created_at_idx").on(
      table.nfeDocumentId,
      table.createdAt
    ),
  })
);

export const nfeDocumentAttachments = pgTable(
  "nfe_document_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeDocumentId: uuid("nfe_document_id")
      .notNull()
      .references(() => nfeDocuments.id, { onDelete: "cascade" }),
    nfeDocumentEventId: uuid("nfe_document_event_id").references(() => nfeDocumentEvents.id, {
      onDelete: "set null",
    }),
    kind: nfeAttachmentKindEnum("kind").notNull(),
    fileName: varchar("file_name", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 128 }),
    storageKey: text("storage_key").notNull(),
    content: text("content"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentIdIdx: index("nfe_document_attachments_document_id_idx").on(table.nfeDocumentId),
    eventIdIdx: index("nfe_document_attachments_event_id_idx").on(table.nfeDocumentEventId),
  })
);

export const nfeNumberRanges = pgTable(
  "nfe_number_ranges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationCompanyId: uuid("organization_company_id")
      .notNull()
      .references(() => organizationCompanies.id, { onDelete: "cascade" }),
    environment: nfeEnvironmentEnum("environment").notNull(),
    model: varchar("model", { length: 2 }).notNull().default("55"),
    series: integer("series").notNull(),
    numberFrom: integer("number_from").notNull(),
    numberTo: integer("number_to").notNull(),
    justification: text("justification"),
    protocol: varchar("protocol", { length: 20 }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyEnvSeriesIdx: index("nfe_number_ranges_company_id_env_series_idx").on(
      table.organizationCompanyId,
      table.environment,
      table.series
    ),
    companyRangeUnique: uniqueIndex("nfe_number_ranges_company_range_unique").on(
      table.organizationCompanyId,
      table.environment,
      table.model,
      table.series,
      table.numberFrom,
      table.numberTo
    ),
  })
);

export const nfeDocumentItems = pgTable(
  "nfe_document_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeDocumentId: uuid("nfe_document_id")
      .notNull()
      .references(() => nfeDocuments.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    prodCodigo: varchar("prod_codigo", { length: 60 }).notNull(),
    descricao: varchar("descricao", { length: 500 }).notNull(),
    ncm: varchar("ncm", { length: 8 }).notNull().default(""),
    cfop: varchar("cfop", { length: 4 }).notNull().default(""),
    qty: numeric("qty", { precision: 15, scale: 4 }).notNull(),
    uom: varchar("uom", { length: 10 }).notNull().default("UN"),
    valorTotal: numeric("valor_total", { precision: 15, scale: 2 }).notNull(),
    xPed: varchar("x_ped", { length: 60 }),
    nItemPed: varchar("n_item_ped", { length: 20 }),
    pedidoValidationStatus: nfePedidoValidationStatusEnum("pedido_validation_status")
      .notNull()
      .default("pending"),
    pedidoValidationMessage: text("pedido_validation_message"),
    sapOrderNumber: varchar("sap_order_number", { length: 20 }),
    sapOrderItem: varchar("sap_order_item", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentLineUnique: uniqueIndex("nfe_document_items_document_line_unique").on(
      table.nfeDocumentId,
      table.lineNumber
    ),
    documentIdIdx: index("nfe_document_items_document_id_idx").on(table.nfeDocumentId),
  })
);

export const nfeInboundProcess = pgTable("nfe_inbound_process", {
  nfeDocumentId: uuid("nfe_document_id")
    .primaryKey()
    .references(() => nfeDocuments.id, { onDelete: "cascade" }),
  inboundStatus: nfeInboundStatusEnum("inbound_status").notNull().default("xml_imported"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).defaultNow().notNull(),
  sefazValidatedAt: timestamp("sefaz_validated_at", { withTimezone: true }),
  pedidoValidatedAt: timestamp("pedido_validated_at", { withTimezone: true }),
  deliveryCreatedAt: timestamp("delivery_created_at", { withTimezone: true }),
  portariaConfirmedAt: timestamp("portaria_confirmed_at", { withTimezone: true }),
  portariaConfirmedByUserId: uuid("portaria_confirmed_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  migoCompletedAt: timestamp("migo_completed_at", { withTimezone: true }),
  miroCompletedAt: timestamp("miro_completed_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedByUserId: uuid("rejected_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  rejectionReason: text("rejection_reason"),
  alertCode: varchar("alert_code", { length: 64 }),
  alertMessage: text("alert_message"),
  correlationId: varchar("correlation_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const nfeSapDocuments = pgTable(
  "nfe_sap_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeDocumentId: uuid("nfe_document_id")
      .notNull()
      .references(() => nfeDocuments.id, { onDelete: "cascade" }),
    nfeItemId: uuid("nfe_item_id").references(() => nfeDocumentItems.id, { onDelete: "set null" }),
    documentType: nfeSapDocumentTypeEnum("document_type").notNull(),
    docNumber: varchar("doc_number", { length: 20 }).notNull(),
    itemNumber: varchar("item_number", { length: 10 }),
    fiscalYear: varchar("fiscal_year", { length: 4 }),
    status: nfeSapDocumentStatusEnum("status").notNull().default("pending"),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentIdIdx: index("nfe_sap_documents_document_id_idx").on(table.nfeDocumentId),
    documentTypeIdx: index("nfe_sap_documents_document_type_idx").on(
      table.nfeDocumentId,
      table.documentType
    ),
  })
);

export const nfeNumberRangeEvents = pgTable(
  "nfe_number_range_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    nfeNumberRangeId: uuid("nfe_number_range_id")
      .notNull()
      .references(() => nfeNumberRanges.id, { onDelete: "cascade" }),
    eventType: nfeNumberRangeEventTypeEnum("event_type").notNull(),
    eventStatus: nfeEventStatusEnum("event_status").notNull().default("pending"),
    sefazStatusCode: varchar("sefaz_status_code", { length: 10 }),
    sefazStatusMessage: text("sefaz_status_message"),
    protocol: varchar("protocol", { length: 20 }),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    rangeCreatedAtIdx: index("nfe_number_range_events_range_id_created_at_idx").on(
      table.nfeNumberRangeId,
      table.createdAt
    ),
  })
);
