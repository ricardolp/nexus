import type { FastifyInstance } from "fastify";
import { loginBruteForceOnRequest } from "../middleware/login-bruteforce.middleware.js";
import { loginBodySchema } from "../schemas.js";
import { loginHandler } from "../handlers/login.handler.js";

export async function loginRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/login",
    {
      preHandler: [loginBruteForceOnRequest],
      config: { rateLimit: { max: 100, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const parsed = loginBodySchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      return loginHandler(request, reply, parsed.data);
    }
  );
}
