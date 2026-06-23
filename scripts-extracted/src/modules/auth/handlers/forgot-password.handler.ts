import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { requestPasswordReset } from "../services/auth.service.js";

export async function forgotPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { email: string }
) {
  await requestPasswordReset(request.server, body.email);
  return sendSuccess(reply, {
    message: request.t("auth_forgot_password_sent"),
  });
}
