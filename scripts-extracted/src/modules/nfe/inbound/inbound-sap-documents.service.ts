import { eq } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import {
  nfeDocuments,
  nfeSapDocuments,
  type nfeSapDocumentTypeEnum,
} from "../../../db/nfe-schema.js";

type DbConn = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
type SapDocType = (typeof nfeSapDocumentTypeEnum.enumValues)[number];

export async function persistSapDocuments(
  db: DbConn,
  input: {
    nfeDocumentId: string;
    documentType: SapDocType;
    lines: {
      docNumber: string;
      itemNumber?: string;
      fiscalYear?: string;
      nfeItemId?: string;
      rawResponse?: Record<string, unknown>;
    }[];
  }
) {
  if (input.lines.length === 0) return;

  await db.insert(nfeSapDocuments).values(
    input.lines.map((line) => ({
      nfeDocumentId: input.nfeDocumentId,
      nfeItemId: line.nfeItemId ?? null,
      documentType: input.documentType,
      docNumber: line.docNumber,
      itemNumber: line.itemNumber ?? null,
      fiscalYear: line.fiscalYear ?? null,
      status: "success" as const,
      rawResponse: line.rawResponse ?? null,
    }))
  );
}

export async function updateDocumentSapCache(
  db: DbConn,
  nfeDocumentId: string,
  patch: { sapDocumentId?: string; sapOrderId?: string }
) {
  if (!patch.sapDocumentId && !patch.sapOrderId) return;
  await db
    .update(nfeDocuments)
    .set({
      ...(patch.sapDocumentId ? { sapDocumentId: patch.sapDocumentId } : {}),
      ...(patch.sapOrderId ? { sapOrderId: patch.sapOrderId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(nfeDocuments.id, nfeDocumentId));
}

export async function loadSapDocumentsByDocumentId(db: DbConn, nfeDocumentId: string) {
  return db
    .select()
    .from(nfeSapDocuments)
    .where(eq(nfeSapDocuments.nfeDocumentId, nfeDocumentId));
}
