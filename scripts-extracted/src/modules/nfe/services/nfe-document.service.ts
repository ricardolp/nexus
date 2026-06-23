import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocumentTimeline,
  nfeDocuments,
  nfeInboundProcess,
} from "../../../db/nfe-schema.js";
import { loadSapDocumentsByDocumentId } from "../inbound/inbound-sap-documents.service.js";
import { organizationCompanies, organizations } from "../../../db/schema.js";
import {
  mapToNotaFiscalDetail,
  pickXmlContentForParsing,
} from "../mappers/nfe-detail.mapper.js";
import { mapToNotaFiscal } from "../mappers/nfe-listing.mapper.js";
import { parseNfeXmlDetail } from "../parsers/nfe-xml.parser.js";
import type { NfeListQuery } from "./nfe-filter.js";
import { buildNfeOrderBy, buildNfeOrgFilter, XML_ATTACHMENT_KINDS } from "./nfe-filter.js";

async function loadXmlFlagsByDocumentIds(
  fastify: FastifyInstance,
  documentIds: string[]
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (documentIds.length === 0) return map;

  const rows = await fastify.db
    .select({
      nfeDocumentId: nfeDocumentAttachments.nfeDocumentId,
    })
    .from(nfeDocumentAttachments)
    .where(
      and(
        inArray(nfeDocumentAttachments.nfeDocumentId, documentIds),
        inArray(nfeDocumentAttachments.kind, [...XML_ATTACHMENT_KINDS])
      )
    )
    .groupBy(nfeDocumentAttachments.nfeDocumentId);

  for (const id of documentIds) {
    map.set(id, false);
  }
  for (const row of rows) {
    map.set(row.nfeDocumentId, true);
  }
  return map;
}

async function loadSapErrorFlagsByDocumentIds(
  fastify: FastifyInstance,
  documentIds: string[]
): Promise<Set<string>> {
  const set = new Set<string>();
  if (documentIds.length === 0) return set;

  const rows = await fastify.db
    .select({ nfeDocumentId: nfeDocumentEvents.nfeDocumentId })
    .from(nfeDocumentEvents)
    .where(
      and(
        inArray(nfeDocumentEvents.nfeDocumentId, documentIds),
        eq(nfeDocumentEvents.eventType, "sap_callback"),
        eq(nfeDocumentEvents.eventStatus, "error")
      )
    )
    .groupBy(nfeDocumentEvents.nfeDocumentId);

  for (const row of rows) {
    set.add(row.nfeDocumentId);
  }
  return set;
}

export async function listNfeDocuments(
  fastify: FastifyInstance,
  organizationId: string,
  query: NfeListQuery
) {
  const where = buildNfeOrgFilter(organizationId, query);
  const offset = (query.page - 1) * query.limit;
  const orderBy = buildNfeOrderBy(query);

  const baseFrom = fastify.db
    .select({
      document: nfeDocuments,
      inboundProcess: nfeInboundProcess,
      companyId: organizationCompanies.id,
      companyDisplayName: organizationCompanies.displayName,
      companyCnpj: organizationCompanies.cnpj,
      companyRazaoSocial: organizationCompanies.razaoSocial,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .innerJoin(organizations, eq(organizationCompanies.organizationId, organizations.id))
    .leftJoin(nfeInboundProcess, eq(nfeInboundProcess.nfeDocumentId, nfeDocuments.id))
    .where(where);

  const [rows, [{ total }]] = await Promise.all([
    baseFrom.orderBy(orderBy).limit(query.limit).offset(offset),
    fastify.db
      .select({ total: count() })
      .from(nfeDocuments)
      .innerJoin(
        organizationCompanies,
        eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
      )
      .leftJoin(nfeInboundProcess, eq(nfeInboundProcess.nfeDocumentId, nfeDocuments.id))
      .where(where),
  ]);

  const documentIds = rows.map((r) => r.document.id);
  const [xmlFlags, sapErrorFlags] = await Promise.all([
    loadXmlFlagsByDocumentIds(fastify, documentIds),
    loadSapErrorFlagsByDocumentIds(fastify, documentIds),
  ]);

  return {
    items: rows.map((row) =>
      mapToNotaFiscal({
        document: row.document,
        inboundProcess: row.inboundProcess,
        companyId: row.companyId,
        companyRazaoSocial: row.companyRazaoSocial,
        companyCnpj: row.companyCnpj,
        organizationId: row.organizationId,
        organizationName: row.organizationName,
        hasXml: xmlFlags.get(row.document.id) ?? false,
        hasSapError: sapErrorFlags.has(row.document.id),
      })
    ),
    total: Number(total),
    page: query.page,
    limit: query.limit,
  };
}

export async function getNfeDocument(
  fastify: FastifyInstance,
  organizationId: string,
  documentId: string
) {
  const [row] = await fastify.db
    .select({
      document: nfeDocuments,
      companyId: organizationCompanies.id,
      companyCnpj: organizationCompanies.cnpj,
      companyRazaoSocial: organizationCompanies.razaoSocial,
      organizationId: organizations.id,
      organizationName: organizations.name,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .innerJoin(organizations, eq(organizationCompanies.organizationId, organizations.id))
    .where(
      and(eq(nfeDocuments.id, documentId), eq(organizationCompanies.organizationId, organizationId))
    )
    .limit(1);

  if (!row) throw new AppError("nfe_document_not_found", 404);

  const [events, timeline, attachments, inboundProcess, sapDocuments, xmlFlags, sapErrorFlags] =
    await Promise.all([
      fastify.db
        .select()
        .from(nfeDocumentEvents)
        .where(eq(nfeDocumentEvents.nfeDocumentId, documentId)),
      fastify.db
        .select()
        .from(nfeDocumentTimeline)
        .where(eq(nfeDocumentTimeline.nfeDocumentId, documentId)),
      fastify.db
        .select()
        .from(nfeDocumentAttachments)
        .where(eq(nfeDocumentAttachments.nfeDocumentId, documentId)),
      fastify.db
        .select()
        .from(nfeInboundProcess)
        .where(eq(nfeInboundProcess.nfeDocumentId, documentId))
        .limit(1),
      loadSapDocumentsByDocumentId(fastify.db, documentId),
      loadXmlFlagsByDocumentIds(fastify, [documentId]),
      loadSapErrorFlagsByDocumentIds(fastify, [documentId]),
    ]);

  const xmlContent = pickXmlContentForParsing(attachments);
  let parsedXml = null;
  if (xmlContent) {
    try {
      parsedXml = parseNfeXmlDetail(xmlContent);
    } catch {
      parsedXml = null;
    }
  }

  return mapToNotaFiscalDetail({
    document: row.document,
    companyId: row.companyId,
    companyCnpj: row.companyCnpj,
    companyRazaoSocial: row.companyRazaoSocial,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    hasXml: xmlFlags.get(documentId) ?? false,
    hasSapError: sapErrorFlags.has(documentId),
    events,
    timeline,
    attachments,
    parsedXml,
    inboundProcess: inboundProcess[0] ?? null,
    sapDocuments,
  });
}

export async function getNfeDocumentsSummary(
  fastify: FastifyInstance,
  organizationId: string,
  companyId?: string
) {
  const where = buildNfeOrgFilter(organizationId, { companyId });

  const [totals] = await fastify.db
    .select({
      count: count(),
      amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(where);

  const byStatus = await fastify.db
    .select({
      status: nfeDocuments.status,
      count: count(),
      amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(where)
    .groupBy(nfeDocuments.status);

  const byDirection = await fastify.db
    .select({
      direction: nfeDocuments.direction,
      count: count(),
      amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(where)
    .groupBy(nfeDocuments.direction);

  return {
    total: {
      count: Number(totals?.count ?? 0),
      amount: totals?.amount ?? "0",
    },
    byStatus: byStatus.map((r) => ({
      status: r.status,
      count: Number(r.count),
      amount: r.amount ?? "0",
    })),
    byDirection: byDirection.map((r) => ({
      direction: r.direction,
      count: Number(r.count),
      amount: r.amount ?? "0",
    })),
  };
}
