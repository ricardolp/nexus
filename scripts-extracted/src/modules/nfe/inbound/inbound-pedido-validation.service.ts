import { eq } from "drizzle-orm";

import type { Db } from "../../../db/client.js";

import { loadEnv } from "../../../config/env.js";

import { nfeDocumentItems, nfeDocuments } from "../../../db/nfe-schema.js";

import { organizationCompanies } from "../../../db/schema.js";

import { AppError } from "../../../common/http/errors.js";

import {

  canUseCpiPurchaseOrderValidation,

  getSapInboundAdapter,

} from "../../../integrations/sap/sap-inbound.factory.js";

import { transitionInboundStatus } from "./inbound-state.service.js";



type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];



export async function runPedidoValidation(db: DbConn, nfeDocumentId: string) {

  const env = loadEnv();



  const [doc] = await db

    .select({

      id: nfeDocuments.id,

      issuerCnpj: nfeDocuments.issuerCnpj,

      recipientDocument: nfeDocuments.recipientDocument,

      issuedAt: nfeDocuments.issuedAt,

      accessKey: nfeDocuments.accessKey,

      organizationId: organizationCompanies.organizationId,

      companyCnpj: organizationCompanies.cnpj,

    })

    .from(nfeDocuments)

    .innerJoin(

      organizationCompanies,

      eq(nfeDocuments.organizationCompanyId, organizationCompanies.id)

    )

    .where(eq(nfeDocuments.id, nfeDocumentId))

    .limit(1);



  if (!doc) return;



  await transitionInboundStatus(db, {

    nfeDocumentId,

    to: "pedido_validating",

    eventType: "pedido_validation",

    title: "Validação pedido SAP iniciada",

    source: "job",

    correlationId: doc.accessKey ?? undefined,

  });



  const items = await db

    .select()

    .from(nfeDocumentItems)

    .where(eq(nfeDocumentItems.nfeDocumentId, nfeDocumentId));



  const linesWithPedido = items.filter((i) => i.xPed?.trim() && i.nItemPed?.trim());



  if (linesWithPedido.length === 0) {

    for (const item of items) {

      await db

        .update(nfeDocumentItems)

        .set({

          pedidoValidationStatus: "alert",

          pedidoValidationMessage: "Pedido de compra não informado no XML",

          updatedAt: new Date(),

        })

        .where(eq(nfeDocumentItems.id, item.id));

    }



    await transitionInboundStatus(db, {

      nfeDocumentId,

      to: "pedido_alert",

      eventType: "pedido_validation",

      title: "Alerta — sem pedido SAP",

      message: "Nenhum item possui xPed e nItemPed no XML.",

      source: "job",

      patchProcess: {

        pedidoValidatedAt: new Date(),

        alertCode: "NO_PURCHASE_ORDER",

        alertMessage: "NF sem referência de pedido de compra",

      },

    });

    return { matched: false as const };

  }



  const canValidate = await canUseCpiPurchaseOrderValidation(

    db,

    env,

    doc.organizationId

  );



  if (!canValidate) {

    for (const item of items) {

      await db

        .update(nfeDocumentItems)

        .set({

          pedidoValidationStatus: "alert",

          pedidoValidationMessage: "Integração CPI/SAP não configurada",

          updatedAt: new Date(),

        })

        .where(eq(nfeDocumentItems.id, item.id));

    }



    await transitionInboundStatus(db, {

      nfeDocumentId,

      to: "pedido_alert",

      eventType: "pedido_validation",

      title: "Alerta — integração SAP indisponível",

      message: "Configure CPI (ou SAP_MOCK_PO=true) para validar pedidos.",

      source: "job",

      patchProcess: {

        pedidoValidatedAt: new Date(),

        alertCode: "CPI_NOT_CONFIGURED",

        alertMessage: "Integração CPI/SAP não configurada",

      },

    });

    return { matched: false as const };

  }



  const branchCnpj =

    doc.recipientDocument?.replace(/\D/g, "").length === 14

      ? doc.recipientDocument.replace(/\D/g, "")

      : doc.companyCnpj;



  const issuedAt = doc.issuedAt ?? new Date();



  let result;

  try {

    const adapter = await getSapInboundAdapter({

      db,

      env,

      organizationId: doc.organizationId,

      integrationLog: {

        nfeDocumentId,

        correlationId: doc.accessKey ?? undefined,

      },

    });

    result = await adapter.validatePurchaseOrderLines({

      cnpj: doc.issuerCnpj,

      branchCnpj,

      issuedAt,

      lines: linesWithPedido.map((i) => ({

        xPed: i.xPed!.trim(),

        nItemPed: i.nItemPed!.trim(),

        qty: parseFloat(i.qty),

        materialCode: i.prodCodigo,

      })),

    });

  } catch (e) {

    const message =

      e instanceof AppError

        ? e.code

        : e instanceof Error

          ? e.message

          : "Erro ao consultar pedidos SAP";



    for (const item of items) {

      await db

        .update(nfeDocumentItems)

        .set({

          pedidoValidationStatus: "alert",

          pedidoValidationMessage: message,

          updatedAt: new Date(),

        })

        .where(eq(nfeDocumentItems.id, item.id));

    }



    await transitionInboundStatus(db, {

      nfeDocumentId,

      to: "pedido_alert",

      eventType: "pedido_validation",

      title: "Alerta — erro consulta SAP",

      message,

      source: "sap",

      patchProcess: {

        pedidoValidatedAt: new Date(),

        alertCode: "PO_SAP_ERROR",

        alertMessage: message,

      },

    });

    return { matched: false as const };

  }



  for (const item of items) {

    const lineResult = result.lines.find(

      (l) =>

        l.xPed === (item.xPed?.trim() ?? "") && l.nItemPed === (item.nItemPed?.trim() ?? "")

    );

    const matched = lineResult?.matched ?? false;

    await db

      .update(nfeDocumentItems)

      .set({

        pedidoValidationStatus: matched ? "matched" : "alert",

        pedidoValidationMessage: lineResult?.message ?? null,

        sapOrderNumber: lineResult?.sapOrderNumber ?? null,

        sapOrderItem: lineResult?.sapOrderItem ?? null,

        updatedAt: new Date(),

      })

      .where(eq(nfeDocumentItems.id, item.id));

  }



  const primaryOrder = result.lines.find((l) => l.sapOrderNumber)?.sapOrderNumber;



  if (result.allMatched) {

    await transitionInboundStatus(db, {

      nfeDocumentId,

      to: "pedido_matched",

      eventType: "pedido_validation",

      title: "Pedido validado no SAP",

      message: `Pedido ${primaryOrder ?? ""} conferido com sucesso.`,

      source: "sap",

      responseSummary: { lines: result.lines },

      patchProcess: {

        pedidoValidatedAt: new Date(),

        alertCode: null,

        alertMessage: null,

      },

    });



    if (primaryOrder) {

      const { updateDocumentSapCache } = await import("./inbound-sap-documents.service.js");

      await updateDocumentSapCache(db, nfeDocumentId, { sapOrderId: primaryOrder });

      await persistPurchaseOrderRefs(db, nfeDocumentId, items, result.lines);

    }



    return { matched: true as const };

  }



  await transitionInboundStatus(db, {

    nfeDocumentId,

    to: "pedido_alert",

    eventType: "pedido_validation",

    title: "Alerta — pedido não encontrado no SAP",

    source: "sap",

    patchProcess: {

      pedidoValidatedAt: new Date(),

      alertCode: "PO_NOT_FOUND",

      alertMessage: "Um ou mais itens não possuem pedido válido no SAP",

    },

  });



  return { matched: false as const };

}



async function persistPurchaseOrderRefs(

  db: DbConn,

  nfeDocumentId: string,

  items: (typeof nfeDocumentItems.$inferSelect)[],

  lines: { xPed: string; nItemPed: string; sapOrderNumber?: string; sapOrderItem?: string }[]

) {

  const { persistSapDocuments } = await import("./inbound-sap-documents.service.js");

  await persistSapDocuments(db, {

    nfeDocumentId,

    documentType: "purchase_order",

    lines: items

      .filter((i) => i.sapOrderNumber)

      .map((i) => {

        const match = lines.find(

          (l) => l.xPed === (i.xPed ?? "") && l.nItemPed === (i.nItemPed ?? "")

        );

        return {

          docNumber: i.sapOrderNumber!,

          itemNumber: i.sapOrderItem ?? match?.sapOrderItem,

          nfeItemId: i.id,

        };

      }),

  });

}


