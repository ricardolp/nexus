import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { confirmEmailRoutes } from "./routes/confirm-email.js";
import { forgotPasswordRoutes } from "./routes/forgot-password.js";
import { loginRoutes } from "./routes/login.js";
import { registerRoutes } from "./routes/register.js";
import { resetPasswordRoutes } from "./routes/reset-password.js";

export async function authModule(fastify: FastifyInstance) {
  await fastify.register(
    async (scope) => {
      await scope.register(rateLimit, {
        global: false,
        redis: fastify.redis,
        nameSpace: "nexus-rl-auth-",
      });
      await scope.register(registerRoutes);
      await scope.register(confirmEmailRoutes);
      await scope.register(loginRoutes);
      await scope.register(forgotPasswordRoutes);
      await scope.register(resetPasswordRoutes);
    },
    { prefix: "/auth" }
  );
}
