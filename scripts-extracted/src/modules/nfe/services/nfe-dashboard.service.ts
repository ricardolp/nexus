import { and, count, eq, inArray, notExists, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocuments,
  nfeInboundProcess,
} from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import {
  buildAlerts,
  buildModelosUsage,
  buildStatusDistribution,
  buildSummaryBucket,
  getDbStatusesForSefaz,
  mapStatusSefaz,
  type NotaFiscalStatusSefaz,
  type NotasFiscaisDashboardResponse,
} from "../mappers/nfe-listing.mapper.js";
import type { NfeFilterQuery } from "./nfe-filter.js";
import { buildNfeOrgFilter, XML_ATTACHMENT_KINDS } from "./nfe-filter.js";

const REJEITADA_STATUSES = getDbStatusesForSefaz("rejeitada");
const AUTORIZADA_STATUSES = getDbStatusesForSefaz("autorizada");
const PENDENTE_STATUSES = getDbStatusesForSefaz("pendente");
const ERROR_STATUSES = ["processing_error", "validation_error"] as const;

function parseAmount(value: string | null | undefined): number {
  return parseFloat(value ?? "0");
}

const sapErrorExists = sql`exists (
  select 1 from ${nfeDocumentEvents}
  where ${nfeDocumentEvents.nfeDocumentId} = ${nfeDocuments.id}
    and ${nfeDocumentEvents.eventType} = 'sap_callback'
    and ${nfeDocumentEvents.eventStatus} = 'error'
)`;

export async function getNfeDashboard(
  fastify: FastifyInstance,
  organizationId: string,
  query: NfeFilterQuery
): Promise<NotasFiscaisDashboardResponse> {
  const where = buildNfeOrgFilter(organizationId, query);
  const db = fastify.db;
  const filterByInbound = Boolean(query.inboundStatus ?? query.statusInterno);

  const companyJoin = (
    selectShape: Parameters<typeof db.select>[0]
  ) => {
    let q = db
      .select(selectShape)
      .from(nfeDocuments)
      .innerJoin(
        organizationCompanies,
        eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
      );
    if (filterByInbound) {
      q = q.leftJoin(
        nfeInboundProcess,
        eq(nfeInboundProcess.nfeDocumentId, nfeDocuments.id)
      );
    }
    return q;
  };

  const [totalsRow] = await companyJoin({
    count: count(),
    amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
  }).where(where);

  const byDirection = await companyJoin({
    direction: nfeDocuments.direction,
    count: count(),
    amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
  })
    .where(where)
    .groupBy(nfeDocuments.direction);

  const byStatusWithAmount = await companyJoin({
    status: nfeDocuments.status,
    count: count(),
    amount: sql<string>`coalesce(sum(${nfeDocuments.totalAmount}), 0)`,
  })
    .where(where)
    .groupBy(nfeDocuments.status);

  const byModel = await companyJoin({
    model: nfeDocuments.model,
    count: count(),
  })
    .where(where)
    .groupBy(nfeDocuments.model);

  const [rejeitadasRow] = await companyJoin({ count: count() }).where(
    and(where, inArray(nfeDocuments.status, REJEITADA_STATUSES))
  );

  const [semXmlRow] = await companyJoin({ count: count() }).where(
    and(
      where,
      notExists(
        db
          .select({ one: sql`1` })
          .from(nfeDocumentAttachments)
          .where(
            and(
              eq(nfeDocumentAttachments.nfeDocumentId, nfeDocuments.id),
              inArray(nfeDocumentAttachments.kind, [...XML_ATTACHMENT_KINDS])
            )
          )
      )
    )
  );

  const [integracaoErroRow] = await companyJoin({ count: count() }).where(
    and(where, or(inArray(nfeDocuments.status, [...ERROR_STATUSES]), sapErrorExists))
  );

  const [semPedidoRow] = await db
    .select({ count: count() })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .innerJoin(nfeInboundProcess, eq(nfeInboundProcess.nfeDocumentId, nfeDocuments.id))
    .where(and(where, eq(nfeInboundProcess.inboundStatus, "pedido_alert")));

  type DocStatus = (typeof nfeDocuments.$inferSelect)["status"];

  const totalCount = Number(totalsRow?.count ?? 0);
  const totalValor = parseAmount(String(totalsRow?.amount ?? "0"));

  const outbound = byDirection.find((r) => r.direction === "outbound");
  const inbound = byDirection.find((r) => r.direction === "inbound");

  let autorizadasCount = 0;
  let autorizadasValor = 0;
  let pendentesCount = 0;
  let pendentesValor = 0;
  let rejeitadasCount = 0;
  let rejeitadasValor = 0;

  const countsBySefaz: Partial<Record<NotaFiscalStatusSefaz, number>> = {};

  for (const row of byStatusWithAmount) {
    const status = row.status as DocStatus;
    const sefaz = mapStatusSefaz(status);
    const c = Number(row.count);
    const amt = parseAmount(String(row.amount ?? "0"));
    countsBySefaz[sefaz] = (countsBySefaz[sefaz] ?? 0) + c;

    if (AUTORIZADA_STATUSES.includes(status)) {
      autorizadasCount += c;
      autorizadasValor += amt;
    }
    if (PENDENTE_STATUSES.includes(status)) {
      pendentesCount += c;
      pendentesValor += amt;
    }
    if (REJEITADA_STATUSES.includes(status)) {
      rejeitadasCount += c;
      rejeitadasValor += amt;
    }
  }

  let model55 = 0;
  let model65 = 0;
  for (const row of byModel) {
    if (row.model === "65") model65 += Number(row.count);
    else model55 += Number(row.count);
  }

  return {
    summary: {
      totalPeriodo: buildSummaryBucket(totalValor, totalCount),
      outbound: buildSummaryBucket(
        parseAmount(outbound?.amount as string | undefined),
        Number(outbound?.count ?? 0)
      ),
      inbound: buildSummaryBucket(
        parseAmount(inbound?.amount as string | undefined),
        Number(inbound?.count ?? 0)
      ),
      autorizadas: buildSummaryBucket(autorizadasValor, autorizadasCount),
      pendentes: buildSummaryBucket(pendentesValor, pendentesCount),
      rejeitadas: buildSummaryBucket(rejeitadasValor, rejeitadasCount),
    },
    statusDistribution: buildStatusDistribution(countsBySefaz),
    alerts: buildAlerts({
      rejeitadas: Number(rejeitadasRow?.count ?? 0),
      integracaoErro: Number(integracaoErroRow?.count ?? 0),
      semXml: Number(semXmlRow?.count ?? 0),
      semPedido: Number(semPedidoRow?.count ?? 0),
    }),
    modelosUsage: buildModelosUsage(model55, model65),
  };
}
