import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";
import type { Env } from "../config/env.js";

export default fp<{ env: Env }>(async (fastify, opts) => {
  const isProd = opts.env.NODE_ENV === "production";

  await fastify.register(helmet, {
    global: true,
    contentSecurityPolicy: isProd ? undefined : false,
  });

  await fastify.register(cors, {
    origin: true,
  });

  await fastify.register(rateLimit, {
    max: 50,
    timeWindow: "1 minute",
  });
});
