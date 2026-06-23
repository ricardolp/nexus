import Fastify from "fastify";
import type { Redis } from "ioredis";
import { ZodError } from "zod";
import { AppError } from "./common/http/errors.js";
import { sendError } from "./common/http/responses.js";
import type { Db } from "./db/client.js";
import type { Env } from "./config/env.js";
import { authModule } from "./modules/auth/index.js";
import { meModule } from "./modules/me/index.js";
import { organizationsModule } from "./modules/organizations/index.js";
import i18n from "./plugins/i18n.js";
import jwt from "./plugins/jwt.js";
import security from "./plugins/security.js";
import type { EmailQueue } from "./workers/email.queue.js";
import type { NfeInboundQueue } from "./workers/nfe-inbound.queue.js";

export async function buildApp(opts: {
  db: Db;
  env: Env;
  emailQueue: EmailQueue;
  nfeInboundQueue: NfeInboundQueue;
  redis: Redis;
}) {
  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024,
    trustProxy: opts.env.NODE_ENV === "production",
  });

  app.decorate("db", opts.db);
  app.decorate("env", opts.env);
  app.decorate("emailQueue", opts.emailQueue);
  app.decorate("nfeInboundQueue", opts.nfeInboundQueue);
  app.decorate("redis", opts.redis);

  await app.register(security, { env: opts.env });
  await app.register(i18n);
  await app.register(jwt, { env: opts.env });

  app.setErrorHandler((error, request, reply) => {
    const t = request.t;
    if (error instanceof ZodError) {
      return sendError(reply, "validation_error", 400, t("validation_error"));
    }
    if (error instanceof AppError) {
      return sendError(reply, error.code, error.statusCode, t(error.code));
    }
    const maybeStatus = error as Error & { statusCode?: number };
    if (maybeStatus.statusCode === 429) {
      return sendError(
        reply,
        "rate_limit_exceeded",
        429,
        t("rate_limit_exceeded")
      );
    }
    if (opts.env.NODE_ENV === "production") {
      app.log.error(error);
      return sendError(reply, "internal_error", 500, t("internal_error"));
    }
    return reply.status(500).send({
      success: false,
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });

  await app.register(authModule);
  await app.register(meModule);
  await app.register(organizationsModule);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
