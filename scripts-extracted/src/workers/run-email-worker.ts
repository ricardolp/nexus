import { createDb } from "../db/client.js";
import { loadEnv } from "../config/env.js";
import { createRedisConnection } from "../redis.js";
import { createEmailWorker } from "./email.worker.js";

const env = loadEnv();
const { db, pool } = createDb(env);
const redis = createRedisConnection(env);
const worker = createEmailWorker(redis, env, db);

worker.on("failed", (job, err) => {
  console.error("Email job failed", job?.id, err.message);
});

worker.on("completed", (job) => {
  console.info("Email job completed", job.id);
});

const shutdown = async () => {
  await worker.close();
  redis.disconnect();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
