import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "../../../config/env.js";
import { AppError } from "../../../common/http/errors.js";
import { nfeDocumentItems, nfeDocuments, nfeSapDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { formatSapDocDate } from "../../../integrations/sap/sap-delivery.client.js";
import { getSapInboundAdapter } from "../../../integrations/sap/sap-inbound.factory.js";
import { persistSapDocuments, updateDocumentSapCache } from "./inbound-sap-documents.service.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";
import { enqueueNfeInboundMiroJob } from "../../../workers/nfe-inbound.enqueue.js";

export async function confirmPortaria(
  fastify: FastifyInstance,
  input: {
    organizationId: string;
    documentId: string;
    userId: string;
  }
) {
  const doc = await loadInboundDocument(fastify, input.organizationId, input.documentId);
  const process = await getInboundProcess(fastify.db, doc.id);
  if (!process) throw new AppError("nfe_inbound_process_not_found", 404);

  if (process.inboundStatus !== "awaiting_portaria") {
    throw new AppError("nfe_inbound_invalid_transition", 409);
  }

  const [delivery] = await fastify.db
    .select()
    .from(nfeSapDocuments)
    .where(
      and(
        eq(nfeSapDocuments.nfeDocumentId, doc.id),
        eq(nfeSapDocuments.documentType, "inbound_delivery")
      )
    )
    .limit(1);

  const deliveryNumber = delivery?.docNumber?.trim();
  if (!deliveryNumber) {
    throw new AppError("validation_error", 400, {
      cause: "Delivery SAP nao encontrada para portaria",
    });
  }

  const items = await fastify.db
    .select()
    .from(nfeDocumentItems)
    .where(eq(nfeDocumentItems.nfeDocumentId, doc.id));

  const orderRefs = items
    .filter((i) => i.sapOrderNumber && i.sapOrderItem)
    .map((i) => ({
      sapOrderNumber: i.sapOrderNumber!,
      sapOrderItem: i.sapOrderItem!,
      qty: parseFloat(i.qty),
      materialCode: i.prodCodigo,
    }));

  if (orderRefs.length === 0) {
    throw new AppError("validation_error", 400, {
      cause: "Pedidos SAP nao encontrados para portaria",
    });
  }

  const env = loadEnv();
  const adapter = await getSapInboundAdapter({
    db: fastify.db,
    env,
    organizationId: input.organizationId,
    integrationLog: {
      nfeDocumentId: doc.id,
      correlationId: doc.accessKey ?? doc.id,
    },
  });

  const portariaResult = await adapter.postInboundDeliveryPortaria({
    numero: String(doc.number),
    serie: String(doc.series),
    datadoc: formatSapDocDate(doc.issuedAt ?? new Date()),
    delivery: deliveryNumber,
    orderRefs,
  });

  await persistSapDocuments(fastify.db, {
    nfeDocumentId: doc.id,
    documentType: "goods_movement",
    lines: portariaResult.lines.map((line) => ({
      docNumber: portariaResult.migoNumber,
      itemNumber: line.itemNumber,
      fiscalYear: portariaResult.migoFiscalYear,
      rawResponse: portariaResult.rawResponse,
    })),
  });

  await updateDocumentSapCache(fastify.db, doc.id, {
    sapDocumentId: portariaResult.migoNumber,
  });

  const now = new Date();
  await transitionInboundStatus(fastify.db, {
    nfeDocumentId: doc.id,
    to: "migo_done",
    eventType: "portaria_confirmation",
    title: "Caminhão confirmado na portaria",
    message: `Portaria confirmada. MIGO ${portariaResult.migoNumber} registrada no SAP.`,
    source: "user",
    triggeredByUserId: input.userId,
    responseSummary: {
      deliveryNumber,
      migoNumber: portariaResult.migoNumber,
      migoFiscalYear: portariaResult.migoFiscalYear,
      rawResponse: portariaResult.rawResponse,
    },
    patchProcess: {
      portariaConfirmedAt: now,
      portariaConfirmedByUserId: input.userId,
      migoCompletedAt: now,
    },
  });

  await enqueueNfeInboundMiroJob(fastify, doc.id);

  return {
    inboundStatus: "migo_done" as const,
    migoNumber: portariaResult.migoNumber,
  };
}

async function loadInboundDocument(
  fastify: FastifyInstance,
  organizationId: string,
  documentId: string
) {
  const [row] = await fastify.db
    .select({
      id: nfeDocuments.id,
      direction: nfeDocuments.direction,
      accessKey: nfeDocuments.accessKey,
      number: nfeDocuments.number,
      series: nfeDocuments.series,
      issuedAt: nfeDocuments.issuedAt,
    })
    .from(nfeDocuments)
    .innerJoin(
      organizationCompanies,
      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)
    )
    .where(
      and(
        eq(nfeDocuments.id, documentId),
        eq(organizationCompanies.organizationId, organizationId),
        eq(nfeDocuments.direction, "inbound")
      )
    )
    .limit(1);

  if (!row) throw new AppError("nfe_document_not_found", 404);
  return row;
}
