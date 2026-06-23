import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { confirmEmail } from "../services/auth.service.js";
import { createUserSession } from "../services/user-session.service.js";

export async function confirmEmailHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { token: string }
) {
  const result = await confirmEmail(request.server, body.token);
  const jti = randomUUID();
  const ua = request.headers["user-agent"];
  await createUserSession(request.server.db, {
    sessionId: jti,
    userId: result.userId,
    userAgent: typeof ua === "string" ? ua : undefined,
    ip: request.ip,
  });
  const token = await reply.jwtSign({ sub: result.userId, jti });
  return sendSuccess(reply, {
    token,
    user: {
      id: result.userId,
      email: result.email,
      name: result.name,
      role: result.role,
      avatar: result.avatar,
      phoneNumber: result.phoneNumber,
      confirmedAt: result.confirmedAt,
      onboardingAt: result.onboardingAt,
    },
  });
}
