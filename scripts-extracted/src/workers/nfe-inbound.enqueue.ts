import type { FastifyInstance } from "fastify";
import type { NfeInboundJobName } from "./nfe-inbound.queue.js";

/** BullMQ proíbe ':' em jobId; UUIDs usam hífen como separador. */
export function nfeInboundJobId(nfeDocumentId: string, jobName: NfeInboundJobName): string {
  return `${nfeDocumentId}-${jobName}`;
}

export async function enqueueNfeInboundJob(
  fastify: FastifyInstance,
  jobName: NfeInboundJobName,
  nfeDocumentId: string
) {
  await fastify.nfeInboundQueue.add(
    jobName,
    { nfeDocumentId },
    { jobId: nfeInboundJobId(nfeDocumentId, jobName) }
  );
}

export async function enqueueNfeInboundPostImport(
  fastify: FastifyInstance,
  nfeDocumentId: string
) {
  return enqueueNfeInboundJob(fastify, "post-import", nfeDocumentId);
}

export async function enqueueNfeInboundMiroJob(
  fastify: FastifyInstance,
  nfeDocumentId: string
) {
  return enqueueNfeInboundJob(fastify, "miro", nfeDocumentId);
}
