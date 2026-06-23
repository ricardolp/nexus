import type { FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../http/responses.js";
import {
  touchSessionLastSeenThrottled,
  validateActiveSession,
} from "../../modules/auth/services/user-session.service.js";

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return sendError(reply, "unauthorized", 401, request.t("unauthorized"));
  }
  const userId = request.user.sub;
  const jti = request.user.jti;
  if (typeof jti !== "string" || jti.length === 0) {
    return sendError(
      reply,
      "auth_session_invalid",
      401,
      request.t("auth_session_invalid")
    );
  }
  const session = await validateActiveSession(request.server.db, userId, jti);
  if (!session) {
    return sendError(
      reply,
      "auth_session_invalid",
      401,
      request.t("auth_session_invalid")
    );
  }
  await touchSessionLastSeenThrottled(
    request.server.db,
    jti,
    session.lastSeenAt
  );
}
