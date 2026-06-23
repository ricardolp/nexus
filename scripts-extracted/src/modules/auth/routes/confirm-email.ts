import type { FastifyInstance } from "fastify";
import { confirmEmailHandler } from "../handlers/confirm-email.handler.js";
import { confirmEmailSchema } from "../schemas.js";

export async function confirmEmailRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/confirm-email",
    { config: { rateLimit: { max: 100, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = confirmEmailSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return confirmEmailHandler(request, reply, parsed.data);
    }
  );
}
