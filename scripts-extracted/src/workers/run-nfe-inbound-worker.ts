import { loadEnv } from "../config/env.js";
import { createDb } from "../db/client.js";
import { createRedisConnection } from "../redis.js";
import { createNfeInboundWorker } from "./nfe-inbound.worker.js";

async function main() {
  const env = loadEnv();
  const { db, pool } = createDb(env);
  const redis = createRedisConnection(env);
  const worker = createNfeInboundWorker(redis, db);

  worker.on("active", (job) => {
    console.log(`[nfe-inbound] active ${job.name} doc=${job.data.nfeDocumentId}`);
  });

  worker.on("completed", (job) => {
    console.log(`[nfe-inbound] completed ${job.name} doc=${job.data.nfeDocumentId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[nfe-inbound] failed ${job?.name ?? "?"} doc=${job?.data?.nfeDocumentId ?? "?"}`,
      err
    );
  });

  const shutdown = async () => {
    await worker.close();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("nfe-inbound worker started (queue: nfe-inbound)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
