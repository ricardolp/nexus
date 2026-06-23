import type { FastifyInstance } from "fastify";
import { forgotPasswordSchema } from "../schemas.js";
import { forgotPasswordHandler } from "../handlers/forgot-password.handler.js";

export async function forgotPasswordRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/forgot-password",
    { config: { rateLimit: { max: 100, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = forgotPasswordSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return forgotPasswordHandler(request, reply, parsed.data);
    }
  );
}
