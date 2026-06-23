import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export type EmailJobPayload = {
  template: "welcome" | "password-reset" | "nfe-inbound-rejected";
  to: string;
  vars: Record<string, string>;
};

export type EmailQueue = Queue<EmailJobPayload, void, string>;

export function createEmailQueue(connection: Redis): EmailQueue {
  return new Queue<EmailJobPayload>("email", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  });
}
