import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendSuccess } from "../../../common/http/responses.js";
import { confirmPortaria } from "../inbound/inbound-portaria.service.js";
import { registerMigo } from "../inbound/inbound-migo.service.js";
import { rejectInboundDocument } from "../inbound/inbound-rejection.service.js";
import { reprocessInboundDocument } from "../inbound/inbound-reprocess.service.js";
import { retrySapStep } from "../inbound/inbound-retry.service.js";
import { nfeDocumentIdParamSchema } from "../schemas.js";

const rejectBodySchema = z.object({
  reason: z.string().trim().min(3).max(2000),
  notifySupplier: z.boolean().optional().default(true),
  supplierEmail: z.string().email().optional(),
});

const registerMigoBodySchema = z.object({
  migoNumber: z.string().trim().max(20).optional(),
  migoItem: z.string().trim().max(10).optional(),
  fiscalYear: z.string().trim().max(4).optional(),
  accountingDocNumber: z.string().trim().max(20).optional(),
  useSapStub: z.boolean().optional().default(true),
});

const retryBodySchema = z.object({
  step: z.enum(["pedido", "delivery", "miro"]),
});

export async function confirmPortariaHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = nfeDocumentIdParamSchema.parse(request.params);
  const result = await confirmPortaria(request.server, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    userId: request.user.sub,
  });
  return sendSuccess(reply, result);
}

export async function registerMigoHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = nfeDocumentIdParamSchema.parse(request.params);
  const body = registerMigoBodySchema.parse(request.body ?? {});
  const result = await registerMigo(request.server, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    userId: request.user.sub,
    ...body,
  });
  return sendSuccess(reply, result);
}

export async function rejectInboundHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = nfeDocumentIdParamSchema.parse(request.params);
  const body = rejectBodySchema.parse(request.body ?? {});
  const result = await rejectInboundDocument(request.server, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    userId: request.user.sub,
    reason: body.reason,
    notifySupplier: body.notifySupplier,
    supplierEmail: body.supplierEmail,
  });
  return sendSuccess(reply, result);
}

const reprocessBodySchema = z.object({
  runInline: z.boolean().optional(),
});

export async function reprocessInboundHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = nfeDocumentIdParamSchema.parse(request.params);
  const body = reprocessBodySchema.parse(request.body ?? {});
  const result = await reprocessInboundDocument(request.server, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    userId: request.user.sub,
    runInline: body.runInline,
  });
  return sendSuccess(reply, result);
}

export async function retrySapStepHandler(request: FastifyRequest, reply: FastifyReply) {
  const params = nfeDocumentIdParamSchema.parse(request.params);
  const body = retryBodySchema.parse(request.body ?? {});
  const result = await retrySapStep(request.server, {
    organizationId: params.organizationId,
    documentId: params.documentId,
    step: body.step,
    userId: request.user.sub,
  });
  return sendSuccess(reply, result);
}
