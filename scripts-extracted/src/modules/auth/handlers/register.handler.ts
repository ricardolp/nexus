import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { registerUser } from "../services/auth.service.js";

export async function registerHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { email: string; password: string; name?: string }
) {
  const result = await registerUser(request.server, body);
  return sendSuccess(
    reply,
    {
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
    },
    201
  );
}
