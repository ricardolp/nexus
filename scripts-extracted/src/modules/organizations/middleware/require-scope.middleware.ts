import type { FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../../../common/http/responses.js";

export function requireScope(scope: string) {
  return async function requireScopeHandler(request: FastifyRequest, reply: FastifyReply) {
    const ctx = request.organizationContext;
    if (ctx?.platformAdminAccess) {
      return;
    }
    if (!ctx?.scopes?.includes(scope)) {
      return sendError(reply, "insufficient_scope", 403, request.t("insufficient_scope"));
    }
  };
}
