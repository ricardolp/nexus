import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { nfeDocumentEvents, nfeDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { enqueueEmailJob } from "../../../workers/email.enqueue.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";

export async function rejectInboundDocument(
  fastify: FastifyInstance,
  input: {
    organizationId: string;
    documentId: string;
    userId: string;
    reason: string;
    notifySupplier?: boolean;
    supplierEmail?: string;
  }
) {
  const [row] = await fastify.db
    .select({
      document: nfeDocuments,
      companyName: organizationCompanies.displayName,
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

  const process = await getInboundProcess(fastify.db, input.documentId);
  if (!process) throw new AppError("nfe_inbound_process_not_found", 404);

  if (process.inboundStatus === "rejected_inbound" || process.inboundStatus === "miro_done") {
    throw new AppError("nfe_inbound_invalid_transition", 409);
  }

  const now = new Date();
  const doc = row.document;

  await transitionInboundStatus(fastify.db, {
    nfeDocumentId: doc.id,
    to: "rejected_inbound",
    eventType: "inbound_rejection",
    title: "NF-e rejeitada — não reconhecida",
    message: input.reason,
    source: "user",
    triggeredByUserId: input.userId,
    patchProcess: {
      rejectedAt: now,
      rejectedByUserId: input.userId,
      rejectionReason: input.reason,
    },
  });

  const seq = await nextEventSequence(fastify, doc.id);
  await fastify.db.insert(nfeDocumentEvents).values({
    nfeDocumentId: doc.id,
    eventType: "manifestation_not_performed",
    eventStatus: "pending",
    sequence: seq,
    sefazStatusMessage: "Manifestação de desconhecimento pendente (fase 2)",
    correlationId: doc.accessKey ?? undefined,
    triggeredByUserId: input.userId,
    startedAt: now,
  });

  const supplierEmail =
    input.supplierEmail?.trim() ||
    extractIssuerEmail(doc.metadata) ||
    null;

  if (input.notifySupplier !== false && supplierEmail) {
    await enqueueEmailJob(fastify.db, fastify.emailQueue, {
      template: "nfe-inbound-rejected",
      to: supplierEmail,
      vars: {
        companyName: row.companyName,
        numero: String(doc.number).padStart(9, "0"),
        serie: String(doc.series),
        chaveAcesso: doc.accessKey ?? "",
        motivo: input.reason,
      },
    });
  }

  return { inboundStatus: "rejected_inbound" as const };
}

async function nextEventSequence(fastify: FastifyInstance, nfeDocumentId: string) {
  const rows = await fastify.db
    .select({ sequence: nfeDocumentEvents.sequence })
    .from(nfeDocumentEvents)
    .where(eq(nfeDocumentEvents.nfeDocumentId, nfeDocumentId));
  return Math.max(0, ...rows.map((r) => r.sequence)) + 1;
}

function extractIssuerEmail(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "issuerEmail" in metadata) {
    const email = (metadata as { issuerEmail?: unknown }).issuerEmail;
    return typeof email === "string" && email.includes("@") ? email : null;
  }
  return null;
}
