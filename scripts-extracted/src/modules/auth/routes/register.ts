import type { FastifyInstance } from "fastify";
import { registerBodySchema } from "../schemas.js";
import { registerHandler } from "../handlers/register.handler.js";

export async function registerRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/register",
    { config: { rateLimit: { max: 100, timeWindow: "1 hour" } } },
    async (request, reply) => {
      const parsed = registerBodySchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return registerHandler(request, reply, parsed.data);
    }
  );
}
