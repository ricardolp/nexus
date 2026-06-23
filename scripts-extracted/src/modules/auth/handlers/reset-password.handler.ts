import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../../common/http/responses.js";
import { resetPassword } from "../services/auth.service.js";

export async function resetPasswordHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  body: { token: string; password: string }
) {
  await resetPassword(request.server, body);
  return sendSuccess(reply, { message: request.t("auth_reset_success") });
}
