import { Redis } from "ioredis";
import type { Env } from "./config/env.js";

export function createRedisConnection(env: Env) {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
