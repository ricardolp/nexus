import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { nfeListQuerySchema, nfeDocumentIdParamSchema } from "../schemas.js";
import {
  getNfeDocument,
  getNfeDocumentsSummary,
  listNfeDocuments,
} from "../services/nfe-document.service.js";

export async function listNfeDocumentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = nfeListQuerySchema.safeParse(request.query);
  if (!query.success) throw query.error;

  const organizationId = request.organizationContext!.organizationId;
  const result = await listNfeDocuments(request.server, organizationId, query.data);
  return sendSuccess(reply, result);
}

export async function getNfeDocumentHandler(request: FastifyRequest, reply: FastifyReply) {
  const parsed = nfeDocumentIdParamSchema.safeParse(request.params);
  if (!parsed.success) throw parsed.error;

  const organizationId = request.organizationContext!.organizationId;
  const result = await getNfeDocument(
    request.server,
    organizationId,
    parsed.data.documentId
  );
  return sendSuccess(reply, result);
}

export async function getNfeDocumentsSummaryHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const companyId =
    typeof request.query === "object" &&
    request.query !== null &&
    "companyId" in request.query &&
    typeof request.query.companyId === "string"
      ? request.query.companyId
      : undefined;

  const result = await getNfeDocumentsSummary(request.server, organizationId, companyId);
  return sendSuccess(reply, { summary: result });
}
