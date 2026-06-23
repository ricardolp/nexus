import type { Redis } from "ioredis";
import type { Db } from "../db/client.js";
import type { Env } from "../config/env.js";
import type { OrganizationRequestContext } from "../modules/organizations/types.js";
import type { EmailQueue } from "../workers/email.queue.js";
import type { NfeInboundQueue } from "../workers/nfe-inbound.queue.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
    env: Env;
    emailQueue: EmailQueue;
    nfeInboundQueue: NfeInboundQueue;
    redis: Redis;
  }

  interface FastifyRequest {
    t: (key: string, opts?: Record<string, string>) => string;
    organizationContext?: OrganizationRequestContext;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; jti: string };
    user: { sub: string; jti: string };
  }
}
