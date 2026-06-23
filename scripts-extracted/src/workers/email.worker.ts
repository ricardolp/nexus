import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "../db/client.js";
import { emailSendLogs } from "../db/schema.js";
import type { Env } from "../config/env.js";
import type { EmailJobPayload } from "./email.queue.js";
import { sendTemplatedEmail } from "../mail/send-templated.js";

export function createEmailWorker(connection: Redis, env: Env, db: Db) {
  return new Worker<EmailJobPayload>(
    "email",
    async (job) => {
      const logId = job.id;
      if (!logId) throw new Error("email job missing id");
      const maxAttempts = job.opts.attempts ?? 1;
      const attempt = job.attemptsMade + 1;
      const now = new Date();

      await db
        .update(emailSendLogs)
        .set({
          status: "processing",
          attempts: attempt,
          updatedAt: now,
        })
        .where(eq(emailSendLogs.id, logId));

      try {
        await sendTemplatedEmail(env, job.data);
        await db
          .update(emailSendLogs)
          .set({
            status: "sent",
            sentAt: new Date(),
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(emailSendLogs.id, logId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isFinal = attempt >= maxAttempts;
        await db
          .update(emailSendLogs)
          .set({
            status: isFinal ? "failed" : "retrying",
            lastError: msg,
            updatedAt: new Date(),
          })
          .where(eq(emailSendLogs.id, logId));
        throw err;
      }
    },
    { connection }
  );
}
