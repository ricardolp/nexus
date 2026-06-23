import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nfeDocumentTimeline, nfeDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { mapTimelineToRecentEvent, type RecentEvent } from "../mappers/nfe-listing.mapper.js";
import type { z } from "zod";
import type { nfeRecentEventsQuerySchema } from "../schemas.js";

type RecentEventsQuery = z.infer<typeof nfeRecentEventsQuerySchema>;

export async function getNfeRecentEvents(
  fastify: FastifyInstance,
  organizationId: string,
  query: RecentEventsQuery
): Promise<{ events: RecentEvent[] }> {
  const rows = await fastify.db
    .select({
      id: nfeDocumentTimeline.id,
      title: nfeDocumentTimeline.title,
      message: nfeDocumentTimeline.message,
      createdAt: nfeDocumentTimeline.createdAt,
      source: nfeDocumentTimeline.source,
      documentNumber: nfeDocuments.number,
      documentStatus: nfeDocuments.status,
    })
    .from(nfeDocumentTimeline)
    .innerJoin(nfeDocuments, eq(nfeDocumentTimeline.nfeDocumentId, nfeDocuments.id))
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(eq(organizationCompanies.organizationId, organizationId))
    .orderBy(desc(nfeDocumentTimeline.createdAt))
    .limit(query.limit);

  return {
    events: rows.map((row) =>
      mapTimelineToRecentEvent({
        id: row.id,
        title: row.title,
        message: row.message,
        createdAt: row.createdAt,
        documentNumber: row.documentNumber,
        documentStatus: row.documentStatus,
        source: row.source,
      })
    ),
  };
}
