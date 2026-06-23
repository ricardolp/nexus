import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { nfeRecentEventsQuerySchema } from "../schemas.js";
import { getNfeRecentEvents } from "../services/nfe-events.service.js";

export async function getNfeRecentEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = nfeRecentEventsQuerySchema.safeParse(request.query);
  if (!query.success) throw query.error;

  const organizationId = request.organizationContext!.organizationId;
  const result = await getNfeRecentEvents(request.server, organizationId, query.data);
  return sendSuccess(reply, result);
}
