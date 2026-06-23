import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { nfeDocuments, nfeInboundProcess } from "../../../db/nfe-schema.js";
import { getStatusesForStatusInterno } from "../inbound/inbound-status.js";
import { organizationCompanies } from "../../../db/schema.js";
import {
  getDbStatusesForSefaz,
  type NotaFiscalStatusSefaz,
} from "../mappers/nfe-listing.mapper.js";
import type { nfeFilterQuerySchema, nfeListQuerySchema } from "../schemas.js";
import type { z } from "zod";

export type NfeFilterQuery = z.infer<typeof nfeFilterQuerySchema>;
export type NfeListQuery = z.infer<typeof nfeListQuerySchema>;

const XML_ATTACHMENT_KINDS = ["xml_authorized", "xml_distribution", "xml_request"] as const;

export function normalizeSearchDigits(search: string): string {
  return search.replace(/\D/g, "");
}

export function buildNfeOrgFilter(organizationId: string, query: NfeFilterQuery): SQL {
  const conditions: SQL[] = [eq(organizationCompanies.organizationId, organizationId)];

  if (query.companyId) {
    conditions.push(eq(organizationCompanies.id, query.companyId));
  }

  const fluxo = query.fluxo ?? query.direction;
  if (fluxo) {
    conditions.push(eq(nfeDocuments.direction, fluxo));
  }

  if (query.status) {
    conditions.push(eq(nfeDocuments.status, query.status));
  }

  if (query.statusSefaz) {
    const statuses = getDbStatusesForSefaz(query.statusSefaz as NotaFiscalStatusSefaz);
    conditions.push(inArray(nfeDocuments.status, statuses));
  }

  if (query.modelo) {
    conditions.push(eq(nfeDocuments.model, query.modelo));
  }

  if (query.environment) {
    conditions.push(eq(nfeDocuments.environment, query.environment));
  }

  if (query.dateFrom) {
    conditions.push(gte(nfeDocuments.issuedAt, query.dateFrom));
  }

  if (query.dateTo) {
    conditions.push(lte(nfeDocuments.issuedAt, query.dateTo));
  }

  if (query.inboundStatus) {
    conditions.push(eq(nfeInboundProcess.inboundStatus, query.inboundStatus));
  }

  if (query.statusInterno) {
    const statuses = getStatusesForStatusInterno(query.statusInterno);
    if (statuses.length > 0) {
      conditions.push(inArray(nfeInboundProcess.inboundStatus, statuses));
    }
  }

  if (query.search) {
    const term = `%${query.search}%`;
    const digits = normalizeSearchDigits(query.search);
    const searchClauses: SQL[] = [
      ilike(nfeDocuments.accessKey, term),
      ilike(nfeDocuments.recipientDocument, term),
      ilike(nfeDocuments.recipientName, term),
      ilike(nfeDocuments.issuerCnpj, term),
      ilike(nfeDocuments.sapDocumentId, term),
      sql`cast(${nfeDocuments.number} as text) ilike ${term}`,
    ];

    if (digits.length > 0) {
      searchClauses.push(
        sql`regexp_replace(${nfeDocuments.recipientDocument}, '[^0-9]', '', 'g') ilike ${`%${digits}%`}`,
        sql`regexp_replace(${nfeDocuments.issuerCnpj}, '[^0-9]', '', 'g') ilike ${`%${digits}%`}`
      );
    }

    const searchOr = or(...searchClauses);
    if (searchOr) conditions.push(searchOr);
  }

  return and(...conditions)!;
}

export function buildNfeOrderBy(query: NfeListQuery) {
  const sortBy = query.sortBy ?? "emissaoAt";
  const sortOrder = query.sortOrder ?? "desc";
  const column =
    sortBy === "valorTotal"
      ? nfeDocuments.totalAmount
      : sortBy === "ultimaAtualizacaoAt"
        ? nfeDocuments.updatedAt
        : nfeDocuments.issuedAt;

  return sortOrder === "asc" ? asc(column) : desc(column);
}

export { XML_ATTACHMENT_KINDS };
