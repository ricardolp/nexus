import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Db } from "../db/client.js";
import { runPostImportPipeline } from "../modules/nfe/inbound/inbound-orchestrator.service.js";
import { runCreateDelivery } from "../modules/nfe/inbound/inbound-delivery.service.js";
import { runMiro } from "../modules/nfe/inbound/inbound-miro.service.js";
import type { NfeInboundJobName, NfeInboundJobPayload } from "./nfe-inbound.queue.js";

export function createNfeInboundWorker(connection: Redis, db: Db) {
  return new Worker<NfeInboundJobPayload, void, NfeInboundJobName>(
    "nfe-inbound",
    async (job) => {
      const { nfeDocumentId } = job.data;
      console.log(`[nfe-inbound] processing ${job.name} ${nfeDocumentId}`);

      try {
        switch (job.name) {
          case "post-import":
            await runPostImportPipeline(db, nfeDocumentId);
            break;
          case "create-delivery":
            await runCreateDelivery(db, nfeDocumentId);
            break;
          case "miro":
            await runMiro(db, nfeDocumentId);
            break;
          default:
            throw new Error(`Unknown nfe-inbound job: ${job.name}`);
        }
      } catch (err) {
        console.error(`[nfe-inbound] error ${job.name} ${nfeDocumentId}`, err);
        throw err;
      }
    },
    { connection }
  );
}
