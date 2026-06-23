/**
 * Enfileira jobs MIRO para documentos inbound pendentes.
 *
 * Uso:
 *   npm run db:trigger:miro-pending
 *   npm run db:trigger:miro-pending -- --document-id=<uuid>
 *   npm run db:trigger:miro-pending -- --document-id=<uuid> --force
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { Queue } from "bullmq";
import { loadEnv } from "../../config/env.js";
import { nfeDocuments, nfeInboundProcess, nfeSapDocuments } from "../nfe-schema.js";
import { createDb } from "../client.js";
import { createRedisConnection } from "../../redis.js";

function parseArgs(argv: string[]) {
  const documentId = argv.find((a) => a.startsWith("--document-id="))?.split("=")[1];
  const force = argv.includes("--force");
  return { documentId, force };
}

async function main() {
  const { documentId, force } = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const { db, pool } = createDb(env);
  const redis = createRedisConnection(env);
  const queue = new Queue("nfe-inbound", { connection: redis });

  try {
    const rows = await db
      .select({
        nfeDocumentId: nfeInboundProcess.nfeDocumentId,
        inboundStatus: nfeInboundProcess.inboundStatus,
      })
      .from(nfeInboundProcess)
      .where(
        documentId
          ? and(
              eq(nfeInboundProcess.nfeDocumentId, documentId),
              inArray(
                nfeInboundProcess.inboundStatus,
                force
                  ? (["migo_done", "miro_pending", "miro_done", "inbound_error"] as const)
                  : (["migo_done", "miro_pending"] as const)
              )
            )
          : inArray(
              nfeInboundProcess.inboundStatus,
              force
                ? (["migo_done", "miro_pending", "miro_done", "inbound_error"] as const)
                : (["migo_done", "miro_pending"] as const)
            )
      );

    if (rows.length === 0) {
      console.log("Nenhum documento elegível para disparo de MIRO.");
      return;
    }

    let enqueued = 0;
    for (const row of rows) {
      if (force) {
        await db
          .delete(nfeSapDocuments)
          .where(
            and(
              eq(nfeSapDocuments.nfeDocumentId, row.nfeDocumentId),
              inArray(nfeSapDocuments.documentType, ["invoice_verification", "accounting_doc"])
            )
          );

        await db
          .update(nfeInboundProcess)
          .set({
            inboundStatus: "migo_done",
            miroCompletedAt: null,
            statusChangedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(nfeInboundProcess.nfeDocumentId, row.nfeDocumentId));

        await db
          .update(nfeDocuments)
          .set({
            sapDocumentId: null,
            updatedAt: new Date(),
          })
          .where(eq(nfeDocuments.id, row.nfeDocumentId));

        await queue.remove(`${row.nfeDocumentId}-miro`).catch(() => undefined);
      }
      await queue.add(
        "miro",
        { nfeDocumentId: row.nfeDocumentId },
        { jobId: `${row.nfeDocumentId}-miro` }
      );
      enqueued += 1;
      console.log(`MIRO enfileirada: ${row.nfeDocumentId} (status atual: ${row.inboundStatus})`);
    }

    console.log(`\nTotal enfileirado: ${enqueued}`);
    console.log("Garanta que o worker está rodando: npm run worker:nfe-inbound");
  } finally {
    await queue.close();
    redis.disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
