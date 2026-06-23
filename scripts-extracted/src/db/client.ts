import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import type { Env } from "../config/env.js";
import * as baseSchema from "./schema.js";
import * as nfeSchema from "./nfe-schema.js";

const schema = { ...baseSchema, ...nfeSchema };

export function createDb(env: Env) {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type Db = ReturnType<typeof createDb>["db"];
