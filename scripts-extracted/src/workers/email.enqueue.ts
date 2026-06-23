import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { emailSendLogs } from "../db/schema.js";
import { emailSubjectForTemplate } from "../mail/send-templated.js";
import type { EmailJobPayload, EmailQueue } from "./email.queue.js";

export async function enqueueEmailJob(db: Db, queue: EmailQueue, payload: EmailJobPayload) {
  const subject = emailSubjectForTemplate(payload.template);
  const [row] = await db
    .insert(emailSendLogs)
    .values({
      recipient: payload.to,
      subject,
      template: payload.template,
      status: "queued",
    })
    .returning({ id: emailSendLogs.id });
  if (!row) throw new Error("email_send_logs insert failed");
  try {
    await queue.add("send", payload, { jobId: row.id });
  } catch (e) {
    await db
      .update(emailSendLogs)
      .set({
        status: "failed",
        lastError: e instanceof Error ? e.message : String(e),
        updatedAt: new Date(),
      })
      .where(eq(emailSendLogs.id, row.id));
    throw e;
  }
}
