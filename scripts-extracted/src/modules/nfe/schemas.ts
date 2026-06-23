import { z } from "zod";
import { organizationIdParamSchema } from "../organizations/schemas.js";

export const nfeDocumentIdParamSchema = organizationIdParamSchema.extend({
  documentId: z.string().uuid(),
});

const nfeDbStatusEnum = z.enum([
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

const nfeFluxoEnum = z.enum(["outbound", "inbound"]);
const nfeStatusSefazEnum = z.enum([
  "autorizada",
  "pendente",
  "rejeitada",
  "em_processamento",
  "cancelada",
]);
const nfeModeloEnum = z.enum(["55", "65"]);
const nfeSortByEnum = z.enum(["emissaoAt", "valorTotal", "ultimaAtualizacaoAt"]);
const nfeSortOrderEnum = z.enum(["asc", "desc"]);

const nfeInboundStatusEnum = z.enum([
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

const nfeStatusInternoEnum = z.enum([
  "inbound",
  "validada",
  "entrada",
  "mov_material",
  "faturada",
  "alerta",
  "rejeitada",
  "erro",
]);

const isoDateSchema = z.coerce.date();

export const nfeFilterQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  fluxo: nfeFluxoEnum.optional(),
  direction: nfeFluxoEnum.optional(),
  status: nfeDbStatusEnum.optional(),
  statusSefaz: nfeStatusSefazEnum.optional(),
  companyId: z.string().uuid().optional(),
  environment: z.enum(["production", "homologation"]).optional(),
  modelo: nfeModeloEnum.optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  inboundStatus: nfeInboundStatusEnum.optional(),
  statusInterno: nfeStatusInternoEnum.optional(),
});

export const nfeListQuerySchema = nfeFilterQuerySchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: nfeSortByEnum.default("emissaoAt"),
  sortOrder: nfeSortOrderEnum.default("desc"),
});

export const nfeDashboardQuerySchema = nfeFilterQuerySchema;

export const nfeRecentEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

/** @deprecated Use nfeListQuerySchema */
export const listNfeDocumentsQuerySchema = nfeListQuerySchema;
