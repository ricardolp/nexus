import { Queue } from "bullmq";
import type { Redis } from "ioredis";

export type NfeInboundJobName = "post-import" | "create-delivery" | "miro";

export type NfeInboundJobPayload = {
  nfeDocumentId: string;
};

export type NfeInboundQueue = Queue<NfeInboundJobPayload, void, NfeInboundJobName>;

export function createNfeInboundQueue(connection: Redis): NfeInboundQueue {
  return new Queue<NfeInboundJobPayload, void, NfeInboundJobName>("nfe-inbound", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}
