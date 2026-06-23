import type { FastifyInstance } from "fastify";
import { resetPasswordSchema } from "../schemas.js";
import { resetPasswordHandler } from "../handlers/reset-password.handler.js";

export async function resetPasswordRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/reset-password",
    { config: { rateLimit: { max: 100, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = resetPasswordSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return resetPasswordHandler(request, reply, parsed.data);
    }
  );
}
