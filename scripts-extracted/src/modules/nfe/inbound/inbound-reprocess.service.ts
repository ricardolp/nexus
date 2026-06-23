import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { nfeDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { enqueueNfeInboundPostImport } from "../../../workers/nfe-inbound.enqueue.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";
import { runPostImportPipeline } from "./inbound-orchestrator.service.js";

const REPROCESSABLE = new Set<string>([
  "xml_imported",
  "inbound_error",
  "pedido_alert",
]);

export async function reprocessInboundDocument(
  fastify: FastifyInstance,
  input: {
    organizationId: string;
    documentId: string;
    userId: string;
    runInline?: boolean;
  }
) {
  const [row] = await fastify.db
    .select({
      id: nfeDocuments.id,
      direction: nfeDocuments.direction,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(
      and(
        eq(nfeDocuments.id, input.documentId),
        eq(organizationCompanies.organizationId, input.organizationId),
        eq(nfeDocuments.direction, "inbound")
      )
    )
    .limit(1);

  if (!row) throw new AppError("nfe_document_not_found", 404);

  const inbound = await getInboundProcess(fastify.db, input.documentId);
  if (!inbound) throw new AppError("nfe_inbound_process_not_found", 404);

  if (!REPROCESSABLE.has(inbound.inboundStatus)) {
    throw new AppError("nfe_inbound_invalid_transition", 409);
  }

  if (inbound.inboundStatus === "inbound_error") {
    await transitionInboundStatus(fastify.db, {
      nfeDocumentId: input.documentId,
      to: "xml_imported",
      title: "Reprocessamento inbound iniciado",
      source: "user",
      triggeredByUserId: input.userId,
    });
  }

  if (input.runInline || process.env.NFE_INBOUND_SYNC_ON_IMPORT === "true") {
    await runPostImportPipeline(fastify.db, input.documentId);
    return { mode: "inline" as const };
  }

  await enqueueNfeInboundPostImport(fastify, input.documentId);
  return { mode: "queued" as const };
}
