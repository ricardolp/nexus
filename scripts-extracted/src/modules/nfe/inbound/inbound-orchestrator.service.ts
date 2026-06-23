import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { nfeDocuments } from "../../../db/nfe-schema.js";
import { runCreateDelivery } from "./inbound-delivery.service.js";
import { runPedidoValidation } from "./inbound-pedido-validation.service.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Pós-import: SEFAZ stub → validação pedido → delivery (se matched). */
export async function runPostImportPipeline(db: DbConn, nfeDocumentId: string) {
  const [doc] = await db
    .select({
      direction: nfeDocuments.direction,
      accessKey: nfeDocuments.accessKey,
      sefazStatusCode: nfeDocuments.sefazStatusCode,
    })
    .from(nfeDocuments)
    .where(eq(nfeDocuments.id, nfeDocumentId))
    .limit(1);

  if (!doc || doc.direction !== "inbound") return;

  const inbound = await getInboundProcess(db, nfeDocumentId);
  const shouldRunSefazStep = inbound?.inboundStatus === "xml_imported";

  if (shouldRunSefazStep) {
    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "sefaz_validated",
      title: "Validação SEFAZ concluída",
      message:
        doc.sefazStatusCode === "100"
          ? "NF-e autorizada (protocolo XML)."
          : "Validação registrada (stub — mensageria SEFAZ na fase 2).",
      source: "sefaz",
      patchProcess: { sefazValidatedAt: new Date() },
    });
  }

  const pedidoResult = await runPedidoValidation(db, nfeDocumentId);
  if (pedidoResult?.matched) {
    await runCreateDelivery(db, nfeDocumentId);
  }
}
