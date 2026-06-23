import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { loadEnv } from "../../../config/env.js";
import { nfeDocumentItems, nfeDocuments } from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import {
  formatSapDocDate,
  readDeliveryNumber,
} from "../../../integrations/sap/sap-delivery.client.js";
import type { SapInboundDeliveryResponse } from "../../../integrations/sap/sap-delivery.types.js";

function readDeliveryNumbersFromRaw(raw: Record<string, unknown>): string[] {
  const body = raw as SapInboundDeliveryResponse;
  const list = body.deliverynumbers ?? body.deliveryNumbers ?? body.DELIVERYNUMBERS;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((v) => String(v).trim()).filter(Boolean);
  }
  const single = readDeliveryNumber(body, "");
  return single ? [single] : [];
}
import {
  canUseCpiPurchaseOrderValidation,
  getSapInboundAdapter,
  getSapInboundStubAdapter,
} from "../../../integrations/sap/sap-inbound.factory.js";
import { persistSapDocuments, updateDocumentSapCache } from "./inbound-sap-documents.service.js";
import { transitionInboundStatus } from "./inbound-state.service.js";

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function runCreateDelivery(db: DbConn, nfeDocumentId: string) {
  const env = loadEnv();

  const [doc] = await db
    .select({
      accessKey: nfeDocuments.accessKey,
      number: nfeDocuments.number,
      series: nfeDocuments.series,
      issuedAt: nfeDocuments.issuedAt,
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

  await transitionInboundStatus(db, {
    nfeDocumentId,
    to: "delivery_creating",
    eventType: "sap_delivery_create",
    title: "Criando delivery no SAP",
    source: "sap",
    correlationId: doc.accessKey,
  });

  const items = await db
    .select()
    .from(nfeDocumentItems)
    .where(eq(nfeDocumentItems.nfeDocumentId, nfeDocumentId));

  const orderRefs = items
    .filter((i) => i.sapOrderNumber && i.sapOrderItem)
    .map((i) => ({
      sapOrderNumber: i.sapOrderNumber!,
      sapOrderItem: i.sapOrderItem!,
      qty: parseFloat(i.qty),
      materialCode: i.prodCodigo,
    }));

  if (orderRefs.length === 0) {
    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "inbound_error",
      eventType: "sap_delivery_create",
      title: "Erro ao criar delivery no SAP",
      message: "Nenhum item com pedido SAP validado para montar a delivery.",
      source: "sap",
    });
    return;
  }

  const issuedAt = doc.issuedAt ?? new Date();
  const deliveryInput = {
    numero: String(doc.number),
    serie: String(doc.series),
    datadoc: formatSapDocDate(issuedAt),
    nfeAccessKey: doc.accessKey,
    orderRefs,
  };

  try {
    const useCpi = await canUseCpiPurchaseOrderValidation(db, env, doc.organizationId);
    const adapter = useCpi
      ? await getSapInboundAdapter({
          db,
          env,
          organizationId: doc.organizationId,
          integrationLog: {
            nfeDocumentId,
            correlationId: doc.accessKey,
          },
        })
      : getSapInboundStubAdapter();

    const delivery = await adapter.createInboundDelivery(deliveryInput);

    const itemRows = await db
      .select({ id: nfeDocumentItems.id, lineNumber: nfeDocumentItems.lineNumber })
      .from(nfeDocumentItems)
      .where(eq(nfeDocumentItems.nfeDocumentId, nfeDocumentId));

    const rawResponse = delivery.rawResponse ?? {
      deliverynumber: delivery.deliveryNumber,
      deliverynumbers: [delivery.deliveryNumber],
    };

    await persistSapDocuments(db, {
      nfeDocumentId,
      documentType: "inbound_delivery",
      lines: delivery.lines.map((line, idx) => ({
        docNumber: line.docNumber,
        itemNumber: line.itemNumber,
        fiscalYear: line.fiscalYear,
        nfeItemId: itemRows[idx]?.id,
        rawResponse,
      })),
    });

    await updateDocumentSapCache(db, nfeDocumentId, {
      sapDocumentId: delivery.deliveryNumber,
    });

    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "awaiting_portaria",
      eventType: "sap_delivery_create",
      title: "Delivery SAP criada — aguardando portaria",
      message: `Delivery ${delivery.deliveryNumber}. Confirme na portaria para liberar o MIGO.`,
      source: "sap",
      responseSummary: {
        deliveryNumber: delivery.deliveryNumber,
        deliveryNumbers: readDeliveryNumbersFromRaw(rawResponse),
        rawResponse,
      },
      patchProcess: { deliveryCreatedAt: new Date() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await transitionInboundStatus(db, {
      nfeDocumentId,
      to: "inbound_error",
      eventType: "sap_delivery_create",
      title: "Erro ao criar delivery no SAP",
      message: msg,
      source: "sap",
    });
    throw err;
  }
}
