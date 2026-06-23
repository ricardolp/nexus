import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export type ClearNfeOptions = {
  /** Limpa apenas documentos (e dependentes) desta empresa. */
  organizationCompanyId?: string;
  /** Remove faixas de numeração e eventos (default: true no clear global). */
  includeNumberRanges?: boolean;
};

export type ClearNfeResult = {
  documentsDeleted?: number;
  numberRangesDeleted?: number;
};

/**
 * Remove todas as NF-e e dados relacionados (itens, inbound, SAP refs, anexos, eventos, timeline).
 * Não altera organizations, companies, users nem integração CPI.
 */
export async function clearNfeData(
  db: Db,
  options: ClearNfeOptions = {}
): Promise<ClearNfeResult> {
  const includeRanges = options.includeNumberRanges ?? !options.organizationCompanyId;

  if (options.organizationCompanyId) {
    const docResult = await db.execute(sql`
      DELETE FROM nfe_documents
      WHERE organization_company_id = ${options.organizationCompanyId}
    `);
    let rangesDeleted = 0;
    if (includeRanges) {
      const rangeResult = await db.execute(sql`
        DELETE FROM nfe_number_ranges
        WHERE organization_company_id = ${options.organizationCompanyId}
      `);
      rangesDeleted = Number(rangeResult.rowCount ?? 0);
    }
    return {
      documentsDeleted: Number(docResult.rowCount ?? 0),
      numberRangesDeleted: rangesDeleted,
    };
  }

  await db.execute(sql`
    TRUNCATE TABLE
      nfe_sap_documents,
      nfe_document_items,
      nfe_inbound_process,
      nfe_document_attachments,
      nfe_document_timeline,
      nfe_document_events,
      nfe_documents
    RESTART IDENTITY CASCADE
  `);

  let numberRangesDeleted = 0;
  if (includeRanges) {
    await db.execute(sql`
      TRUNCATE TABLE nfe_number_range_events, nfe_number_ranges RESTART IDENTITY CASCADE
    `);
  }

  return { numberRangesDeleted };
}
