import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { createDb } from "./db/client.js";
import { createRedisConnection } from "./redis.js";
import { createEmailQueue } from "./workers/email.queue.js";
import { createNfeInboundQueue } from "./workers/nfe-inbound.queue.js";

async function main() {
  const env = loadEnv();
  const { db, pool } = createDb(env);
  const redis = createRedisConnection(env);
  const emailQueue = createEmailQueue(redis);
  const nfeInboundQueue = createNfeInboundQueue(redis);

  const app = await buildApp({ db, env, emailQueue, nfeInboundQueue, redis });

  const shutdown = async () => {
    await app.close();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
