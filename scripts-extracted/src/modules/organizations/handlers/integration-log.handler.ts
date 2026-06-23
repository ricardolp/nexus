import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { sendSuccess } from "../../../common/http/responses.js";
import {
  getIntegrationRequestLogById,
  listIntegrationRequestLogs,
} from "../../integrations/integration-log.service.js";
import {
  integrationLogIdParamSchema,
  listIntegrationLogsQuerySchema,
} from "../schemas.js";

export async function listOrganizationIntegrationLogsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const parsed = listIntegrationLogsQuerySchema.safeParse(request.query);
  if (!parsed.success) throw parsed.error;

  const { page, limit, operation, success, nfeDocumentId, from, to } = parsed.data;
  const result = await listIntegrationRequestLogs(request.server.db, organizationId, {
    page,
    limit,
    operation,
    success,
    nfeDocumentId,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  });

  return sendSuccess(reply, result);
}

export async function getOrganizationIntegrationLogHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const organizationId = request.organizationContext!.organizationId;
  const parsed = integrationLogIdParamSchema.safeParse(request.params);
  if (!parsed.success) throw parsed.error;

  const log = await getIntegrationRequestLogById(
    request.server.db,
    organizationId,
    parsed.data.logId
  );
  if (!log) {
    throw new AppError("integration_log_not_found", 404);
  }

  return sendSuccess(reply, { log });
}
