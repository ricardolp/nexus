import { and, eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { loadEnv } from "../../../config/env.js";
import { nfeDocumentItems, nfeDocuments, nfeSapDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { getSapInboundAdapter } from "../../../integrations/sap/sap-inbound.factory.js";
import { persistSapDocuments, updateDocumentSapCache } from "./inbound-sap-documents.service.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function runMiro(db: DbConn, nfeDocumentId: string) {
  const process = await getInboundProcess(db, nfeDocumentId);
  if (!process || process.inboundStatus !== "migo_done") return;

  const [doc] = await db
    .select({
      accessKey: nfeDocuments.accessKey,
      number: nfeDocuments.number,
      series: nfeDocuments.series,
      issuedAt: nfeDocuments.issuedAt,
      totalAmount: nfeDocuments.totalAmount,
      organizationId: organizationCompanies.organizationId,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(eq(nfeDocuments.id, nfeDocumentId))
    .limit(1);

  if (!doc?.accessKey) return;

  const [migo] = await db
    .select()
    .from(nfeSapDocuments)
    .where(
      and(
        eq(nfeSapDocuments.nfeDocumentId, nfeDocumentId),
        eq(nfeSapDocuments.documentType, "goods_movement")
      )
    )
    .limit(1);

  const items = await db
    .select()
    .from(nfeDocumentItems)
    .where(eq(nfeDocumentItems.nfeDocumentId, nfeDocumentId));

  const orderRefs = items
    .filter((item) => item.sapOrderNumber && item.sapOrderItem)
    .map((item) => ({
      sapOrderNumber: item.sapOrderNumber!,
      sapOrderItem: item.sapOrderItem!,
      qty: parseFloat(item.qty),
      itemAmount: parseFloat(item.valorTotal),
      nfItem: item.lineNumber,
      poUnit: item.uom,
    }));

  if (orderRefs.length === 0) {
    throw new Error("Nenhum item com pedido SAP validado para montar a MIRO.");
  }

  await transitionInboundStatus(db, {
    nfeDocumentId,
    to: "miro_pending",
    eventType: "sap_miro",
    title: "Faturamento (MIRO) em processamento",
    source: "job",
  });

  try {
    const env = loadEnv();
    const adapter = await getSapInboundAdapter({
      db,
      env,
      organizationId: doc.organizationId,
      integrationLog: {
        nfeDocumentId,
        correlationId: doc.accessKey,
      },
    });
    const miro = await adapter.postInvoiceVerificationMiro({
      numero: String(doc.number),
      serie: String(doc.series),
      datadoc: doc.issuedAt ?? new Date(),
      datalanc: new Date(),
      valorTotal: Number(doc.totalAmount ?? 0),
      orderRefs,
      nfeAccessKey: doc.accessKey,
      migoNumber: migo?.docNumber,
      fiscalYear: migo?.fiscalYear ?? undefined,
    });

    await persistSapDocuments(db, {
      nfeDocumentId,
      documentType: "invoice_verification",
      lines: miro.lines.map((line) => ({
        docNumber: line.docNumber,
        itemNumber: line.itemNumber,
        fiscalYear: line.fiscalYear,
        rawResponse: miro.rawResponse ?? { miro },
      })),
    });

    if (miro.accountingDocNumber) {
      await persistSapDocuments(db, {
        nfeDocumentId,
        documentType: "accounting_doc",
        lines: [{ docNumber: miro.accountingDocNumber, fiscalYear: miro.fiscalYear }],
      });
    }

    await updateDocumentSapCache(db, nfeDocumentId, {
      sapDocumentId: miro.miroNumber,
    });

    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "miro_done",
      eventType: "sap_miro",
      title: "Faturada (MIRO)",
      message: `MIRO ${miro.miroNumber}`,
      source: "sap",
      patchProcess: { miroCompletedAt: new Date() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "inbound_error",
      eventType: "sap_miro",
      title: "Erro ao processar MIRO",
      message: msg,
      source: "sap",
    });
    throw err;
  }
}
