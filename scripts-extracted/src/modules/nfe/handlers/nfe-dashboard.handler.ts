import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { nfeDashboardQuerySchema } from "../schemas.js";
import { getNfeDashboard } from "../services/nfe-dashboard.service.js";

export async function getNfeDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = nfeDashboardQuerySchema.safeParse(request.query);
  if (!query.success) throw query.error;

  const organizationId = request.organizationContext!.organizationId;
  const result = await getNfeDashboard(request.server, organizationId, query.data);
  return sendSuccess(reply, result);
}
