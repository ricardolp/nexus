import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import { nfeDocuments, nfeSapDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { getSapInboundStubAdapter } from "../../../integrations/sap/sap-inbound.factory.js";
import { persistSapDocuments, updateDocumentSapCache } from "./inbound-sap-documents.service.js";
import { getInboundProcess, transitionInboundStatus } from "./inbound-state.service.js";
import { enqueueNfeInboundMiroJob } from "../../../workers/nfe-inbound.enqueue.js";

export type RegisterMigoInput = {
  organizationId: string;
  documentId: string;
  userId: string;
  migoNumber?: string;
  migoItem?: string;
  fiscalYear?: string;
  accountingDocNumber?: string;
  useSapStub?: boolean;
};

export async function registerMigo(fastify: FastifyInstance, input: RegisterMigoInput) {
  const doc = await loadInboundDocument(fastify, input.organizationId, input.documentId);
  const process = await getInboundProcess(fastify.db, doc.id);
  if (!process) throw new AppError("nfe_inbound_process_not_found", 404);

  if (process.inboundStatus !== "migo_pending") {
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

  let migoNumber = input.migoNumber?.trim();
  let fiscalYear = input.fiscalYear?.trim();
  let accountingDocNumber = input.accountingDocNumber?.trim();

  if (input.useSapStub !== false && !migoNumber) {
    const adapter = getSapInboundStubAdapter();
    const migo = await adapter.postGoodsMovementMigo({
      deliveryNumber: delivery?.docNumber ?? doc.accessKey ?? doc.id,
      fiscalYear: delivery?.fiscalYear ?? undefined,
    });
    migoNumber = migo.migoNumber;
    fiscalYear = migo.fiscalYear;
    accountingDocNumber = migo.accountingDocNumber;

    await persistSapDocuments(fastify.db, {
      nfeDocumentId: doc.id,
      documentType: "goods_movement",
      lines: migo.lines.map((line) => ({
        docNumber: line.docNumber,
        itemNumber: line.itemNumber ?? input.migoItem,
        fiscalYear: line.fiscalYear,
        rawResponse: { migo },
      })),
    });

    if (accountingDocNumber) {
      await persistSapDocuments(fastify.db, {
        nfeDocumentId: doc.id,
        documentType: "accounting_doc",
        lines: [{ docNumber: accountingDocNumber, fiscalYear }],
      });
    }
  } else if (!migoNumber) {
    throw new AppError("validation_error", 400);
  } else {
    await persistSapDocuments(fastify.db, {
      nfeDocumentId: doc.id,
      documentType: "goods_movement",
      lines: [
        {
          docNumber: migoNumber,
          itemNumber: input.migoItem,
          fiscalYear,
        },
      ],
    });
    if (accountingDocNumber) {
      await persistSapDocuments(fastify.db, {
        nfeDocumentId: doc.id,
        documentType: "accounting_doc",
        lines: [{ docNumber: accountingDocNumber, fiscalYear }],
      });
    }
  }

  await updateDocumentSapCache(fastify.db, doc.id, { sapDocumentId: migoNumber });

  const now = new Date();
  await transitionInboundStatus(fastify.db, {
    nfeDocumentId: doc.id,
    to: "migo_done",
    eventType: "sap_migo",
    title: "Movimentação de material (MIGO) registrada",
    message: `MIGO ${migoNumber}`,
    source: "user",
    triggeredByUserId: input.userId,
    patchProcess: { migoCompletedAt: now },
  });

  await enqueueNfeInboundMiroJob(fastify, doc.id);

  return { inboundStatus: "migo_done" as const, migoNumber };
}

async function loadInboundDocument(
  fastify: FastifyInstance,
  organizationId: string,
  documentId: string
) {
  const [row] = await fastify.db
    .select({
      id: nfeDocuments.id,
      accessKey: nfeDocuments.accessKey,
      direction: nfeDocuments.direction,
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
