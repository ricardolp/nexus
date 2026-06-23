import type { FastifyReply, FastifyRequest } from "fastify";
import { sendError } from "../../../common/http/responses.js";
import { assertLoginNotBruteLocked } from "../services/login-bruteforce.js";
import { blockUserByEmailAfterLoginRateAbuse } from "../services/auth.service.js";

function pickLoginEmail(request: FastifyRequest): string | null {
  const body = request.body as { email?: unknown } | undefined;
  if (body && typeof body.email === "string") {
    const e = body.email.trim();
    return e.length > 0 ? e : null;
  }
  return null;
}

export async function loginBruteForceOnRequest(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const result = await assertLoginNotBruteLocked(
    request.server.redis,
    request.ip,
    {
      lastEmailAttempt: pickLoginEmail(request),
      onEscalateToTier2: async (email) => {
        try {
          await blockUserByEmailAfterLoginRateAbuse(request.server, email);
        } catch (err) {
          request.log.error(
            { err },
            "Failed to persist user block after login rate abuse (tier 2)"
          );
        }
      },
    }
  );
  if (!result.locked) return;
  reply.header("retry-after", String(result.retryAfterSec));
  return sendError(
    reply,
    "auth_login_locked",
    429,
    request.t("auth_login_locked")
  );
}
