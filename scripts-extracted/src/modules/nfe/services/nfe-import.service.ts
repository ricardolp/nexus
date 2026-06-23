import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../../common/http/errors.js";
import type { Db } from "../../../db/client.js";
import {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocumentItems,
  nfeDocumentTimeline,
  nfeDocuments,
} from "../../../db/nfe-schema.js";
import { organizationCompanies } from "../../../db/schema.js";
import { createInboundProcess } from "../inbound/inbound-state.service.js";
import { runPostImportPipeline } from "../inbound/inbound-orchestrator.service.js";
import { enqueueNfeInboundPostImport } from "../../../workers/nfe-inbound.enqueue.js";
import {
  parseNfeXml,
  parseNfeXmlDetail,
  resolveOrganizationCompanyDocument,
  type ParsedNfeXml,
} from "../parsers/nfe-xml.parser.js";

type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type ImportNfeDocumentInput = {
  organizationId: string;
  companyId?: string;
  xmlBuffer: Buffer;
  fileName: string;
  triggeredByUserId?: string;
};

function mapImportedDocument(
  document: typeof nfeDocuments.$inferSelect,
  company: {
    id: string;
    displayName: string;
    cnpj: string;
    razaoSocial: string;
  }
) {
  return {
    id: document.id,
    organizationCompanyId: document.organizationCompanyId,
    company: {
      id: company.id,
      displayName: company.displayName,
      cnpj: company.cnpj,
      razaoSocial: company.razaoSocial,
    },
    direction: document.direction,
    environment: document.environment,
    status: document.status,
    model: document.model,
    series: document.series,
    number: document.number,
    accessKey: document.accessKey,
    issuerCnpj: document.issuerCnpj,
    recipientDocument: document.recipientDocument,
    recipientName: document.recipientName,
    totalAmount: document.totalAmount,
    issuedAt: document.issuedAt,
    authorizedAt: document.authorizedAt,
    cancelledAt: document.cancelledAt,
    authorizationProtocol: document.authorizationProtocol,
    cancellationProtocol: document.cancellationProtocol,
    sefazStatusCode: document.sefazStatusCode,
    sefazStatusMessage: document.sefazStatusMessage,
    sapDocumentId: document.sapDocumentId,
    sapOrderId: document.sapOrderId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function resolveCompany(
  db: Db | DbTransaction,
  organizationId: string,
  parsed: ParsedNfeXml,
  companyId?: string
) {
  const recipientDocument = parsed.recipientDocument;
  const issuerDocument = parsed.issuerCnpj;
  const expectedDocuments = [recipientDocument, issuerDocument].filter(
    (v): v is string => Boolean(v)
  );
  const fallbackExpectedDocument = resolveOrganizationCompanyDocument(parsed);

  if (companyId) {
    const [company] = await db
      .select({
        id: organizationCompanies.id,
        cnpj: organizationCompanies.cnpj,
        displayName: organizationCompanies.displayName,
        razaoSocial: organizationCompanies.razaoSocial,
      })
      .from(organizationCompanies)
      .where(
        and(
          eq(organizationCompanies.id, companyId),
          eq(organizationCompanies.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!company) throw new AppError("nfe_xml_company_not_found", 404);
    if (!expectedDocuments.includes(company.cnpj)) {
      throw new AppError("nfe_xml_company_not_found", 404);
    }
    return company;
  }

  const companies = await db
    .select({
      id: organizationCompanies.id,
      cnpj: organizationCompanies.cnpj,
      displayName: organizationCompanies.displayName,
      razaoSocial: organizationCompanies.razaoSocial,
    })
    .from(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        inArray(organizationCompanies.cnpj, expectedDocuments)
      )
    )
    .limit(2);

  if (companies.length > 0) {
    const recipientMatch =
      recipientDocument != null
        ? companies.find((company) => company.cnpj === recipientDocument)
        : undefined;
    return recipientMatch ?? companies[0]!;
  }

  const [fallbackCompany] = await db
    .select({
      id: organizationCompanies.id,
      cnpj: organizationCompanies.cnpj,
      displayName: organizationCompanies.displayName,
      razaoSocial: organizationCompanies.razaoSocial,
    })
    .from(organizationCompanies)
    .where(
      and(
        eq(organizationCompanies.organizationId, organizationId),
        eq(organizationCompanies.cnpj, fallbackExpectedDocument)
      )
    )
    .limit(1);

  if (!fallbackCompany) throw new AppError("nfe_xml_company_not_found", 404);
  return fallbackCompany;
}

function resolveDirectionForOrganization(
  parsed: ParsedNfeXml,
  companyCnpj: string
): ParsedNfeXml["direction"] {
  if (parsed.recipientDocument && parsed.recipientDocument === companyCnpj) return "inbound";
  if (parsed.issuerCnpj === companyCnpj) return "outbound";
  return parsed.direction;
}

async function assertAccessKeyNotDuplicate(db: Db | DbTransaction, accessKey: string) {
  const [existing] = await db
    .select({ id: nfeDocuments.id })
    .from(nfeDocuments)
    .where(eq(nfeDocuments.accessKey, accessKey))
    .limit(1);

  if (existing) throw new AppError("nfe_document_duplicate", 409);
}

export async function importNfeDocument(
  fastify: FastifyInstance,
  input: ImportNfeDocumentInput
) {
  const xmlText = input.xmlBuffer.toString("utf8");
  const parsed = parseNfeXml(input.xmlBuffer);
  const parsedDetail = parseNfeXmlDetail(xmlText);
  await assertAccessKeyNotDuplicate(fastify.db, parsed.accessKey);
  const company = await resolveCompany(
    fastify.db,
    input.organizationId,
    parsed,
    input.companyId
  );
  const direction = resolveDirectionForOrganization(parsed, company.cnpj);

  const checksumSha256 = createHash("sha256").update(input.xmlBuffer).digest("hex");
  const attachmentKind = parsed.status === "authorized" ? "xml_authorized" : "xml_distribution";

  let result: {
    document: ReturnType<typeof mapImportedDocument>;
    attachmentId: string;
    inboundStarted: boolean;
  };

  try {
    result = await fastify.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(nfeDocuments)
        .values({
          organizationCompanyId: company.id,
          direction,
          environment: parsed.environment,
          status: parsed.status,
          model: parsed.model,
          series: parsed.series,
          number: parsed.number,
          accessKey: parsed.accessKey,
          issuerCnpj: parsed.issuerCnpj,
          recipientDocument: parsed.recipientDocument,
          recipientName: parsed.recipientName,
          totalAmount: parsed.totalAmount,
          issuedAt: parsed.issuedAt,
          authorizedAt: parsed.authorizedAt,
          authorizationProtocol: parsed.authorizationProtocol,
          sefazStatusCode: parsed.sefazStatusCode,
          sefazStatusMessage: parsed.sefazStatusMessage,
          idempotencyKey: parsed.accessKey,
          metadata: {
            importSource: "api_upload",
            fileName: input.fileName,
            natOp: parsed.natOp,
            verProc: parsed.verProc,
          },
        })
        .returning();

      const doc = document!;

      const [event] = await tx
        .insert(nfeDocumentEvents)
        .values({
          nfeDocumentId: doc.id,
          eventType: "xml_import",
          eventStatus: "accepted",
          sequence: 1,
          sefazStatusCode: parsed.sefazStatusCode,
          sefazStatusMessage: parsed.sefazStatusMessage,
          protocol: parsed.authorizationProtocol,
          correlationId: `import-${parsed.accessKey}`,
          requestSummary: { fileName: input.fileName, source: "api_upload" },
          responseSummary: { status: parsed.status, direction },
          triggeredByUserId: input.triggeredByUserId ?? null,
          startedAt: new Date(),
          completedAt: new Date(),
        })
        .returning({ id: nfeDocumentEvents.id });

      await tx.insert(nfeDocumentTimeline).values([
        {
          nfeDocumentId: doc.id,
          nfeDocumentEventId: event!.id,
          source: "api",
          title: "XML importado",
          message: `Nota ${parsed.number} série ${parsed.series} registrada via upload.`,
          createdByUserId: input.triggeredByUserId ?? null,
        },
        {
          nfeDocumentId: doc.id,
          nfeDocumentEventId: event!.id,
          source: "system",
          title: "Documento criado",
          message: `Importação do arquivo ${input.fileName}.`,
          createdByUserId: input.triggeredByUserId ?? null,
        },
      ]);

      const [attachment] = await tx
        .insert(nfeDocumentAttachments)
        .values({
          nfeDocumentId: doc.id,
          nfeDocumentEventId: event!.id,
          kind: attachmentKind,
          fileName: input.fileName,
          contentType: "application/xml",
          storageKey: "pending",
          content: xmlText,
          sizeBytes: input.xmlBuffer.length,
          checksumSha256,
        })
        .returning({ id: nfeDocumentAttachments.id });

      await tx
        .update(nfeDocumentAttachments)
        .set({ storageKey: `inline:${attachment!.id}` })
        .where(eq(nfeDocumentAttachments.id, attachment!.id));

      if (direction === "inbound") {
        if (parsedDetail.itens.length > 0) {
          await tx.insert(nfeDocumentItems).values(
            parsedDetail.itens.map((item) => ({
              nfeDocumentId: doc.id,
              lineNumber: item.item,
              prodCodigo: item.codigo,
              descricao: item.descricao,
              ncm: item.ncm,
              cfop: item.cfop,
              qty: String(item.quantidade),
              uom: item.unidade,
              valorTotal: String(item.valorTotal),
              xPed: item.xPed ?? null,
              nItemPed: item.nItemPed ?? null,
            }))
          );
        }

        await createInboundProcess(tx, doc.id, parsed.accessKey);
      }

      return {
        document: mapImportedDocument(doc, company),
        attachmentId: attachment!.id,
        inboundStarted: direction === "inbound",
      };
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) {
      throw new AppError("nfe_document_duplicate", 409, { cause: e });
    }
    throw e;
  }

  let inboundQueued = false;
  if (result.inboundStarted) {
    try {
      await enqueueNfeInboundPostImport(fastify, result.document.id);
      inboundQueued = true;
    } catch (enqueueErr) {
      fastify.log.warn(
        { err: enqueueErr, documentId: result.document.id },
        "Falha ao enfileirar nfe-inbound; executando pipeline inline"
      );
      await runPostImportPipeline(fastify.db, result.document.id);
    }
  }

  return {
    document: result.document,
    attachmentId: result.attachmentId,
    inboundQueued,
  };
}

function isPgUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}
