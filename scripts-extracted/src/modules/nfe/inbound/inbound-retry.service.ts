import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { nfeDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { enqueueNfeInboundJob } from "../../../workers/nfe-inbound.enqueue.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";
import type { NfeInboundStatus } from "./inbound-status.js";

export type RetrySapStep = "pedido" | "delivery" | "miro";

export async function retrySapStep(
  fastify: FastifyInstance,
  input: {
    organizationId: string;
    documentId: string;
    step: RetrySapStep;
    userId: string;
  }
) {
  const [row] = await fastify.db
    .select({ id: nfeDocuments.id })
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

  if (process.inboundStatus !== "inbound_error") {
    throw new AppError("nfe_inbound_invalid_transition", 409);
  }

  const targetByStep: Record<RetrySapStep, NfeInboundStatus> = {
    pedido: "pedido_validating",
    delivery: "delivery_creating",
    miro: "miro_pending",
  };

  await transitionInboundStatus(fastify.db, {
    nfeDocumentId: input.documentId,
    to: targetByStep[input.step],
    title: `Reprocessamento SAP: ${input.step}`,
    source: "user",
    triggeredByUserId: input.userId,
  });

  const jobName =
    input.step === "pedido"
      ? "post-import"
      : input.step === "delivery"
        ? "create-delivery"
        : "miro";

  await enqueueNfeInboundJob(fastify, jobName, input.documentId);

  return { queued: jobName };
}
