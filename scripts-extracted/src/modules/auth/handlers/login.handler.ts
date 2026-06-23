import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { sendSuccess } from "../../../common/http/responses.js";
import { getOrganizationForUserMember } from "../../organizations/services/organization.service.js";
import { loginUser } from "../services/auth.service.js";
import { createUserSession } from "../services/user-session.service.js";
import {
  clearLoginBruteForIp,
  recordLoginCredentialFailure,
} from "../services/login-bruteforce.js";

export async function loginHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { email: string; password: string }
) {
  try {
    const result = await loginUser(request.server, body);
    const organization =
      result.role === "member"
        ? await getOrganizationForUserMember(request.server, result.userId)
        : null;
    await clearLoginBruteForIp(request.server.redis, request.ip);
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
      email: result.email,
      name: result.name,
      role: result.role,
      avatar: result.avatar,
      phoneNumber: result.phoneNumber,
      confirmedAt: result.confirmedAt,
      onboardingAt: result.onboardingAt,
    },
    organization,
  });
  } catch (e) {
    if (
      e instanceof AppError &&
      e.code === "auth_invalid_credentials"
    ) {
      await recordLoginCredentialFailure(
        request.server.redis,
        request.ip,
        body.email
      );
    }
    throw e;
  }
}
