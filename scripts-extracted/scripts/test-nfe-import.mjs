import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import Fastify from "fastify";
import { loadEnv } from "../dist/config/env.js";
import { createDb } from "../dist/db/client.js";
import {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocumentTimeline,
  nfeDocuments,
} from "../dist/db/nfe-schema.js";
import { organizationCompanies } from "../dist/db/schema.js";
import { importNfeDocument } from "../dist/modules/nfe/services/nfe-import.service.js";
import { parseNfeXml } from "../dist/modules/nfe/parsers/nfe-xml.parser.js";

const TEST_CNPJ = "13677964000200";
const env = loadEnv();
const { db, pool } = createDb(env);
const app = Fastify({ logger: false });
app.decorate("db", db);

const [existingOrgCompany] = await db
  .select({ organizationId: organizationCompanies.organizationId })
  .from(organizationCompanies)
  .limit(1);

if (!existingOrgCompany) {
  console.error("Nenhuma organização com empresa no banco.");
  process.exit(1);
}

const organizationId = existingOrgCompany.organizationId;

let [company] = await db
  .select({
    id: organizationCompanies.id,
    cnpj: organizationCompanies.cnpj,
  })
  .from(organizationCompanies)
  .where(
    and(
      eq(organizationCompanies.organizationId, organizationId),
      eq(organizationCompanies.cnpj, TEST_CNPJ)
    )
  )
  .limit(1);

let createdTestCompany = false;
if (!company) {
  const [inserted] = await db
    .insert(organizationCompanies)
    .values({
      organizationId,
      cnpj: TEST_CNPJ,
      razaoSocial: "LS Mtron Import Test",
      displayName: "LS Mtron Test",
      slug: "ls-mtron-import-test",
    })
    .returning({ id: organizationCompanies.id, cnpj: organizationCompanies.cnpj });
  company = inserted;
  createdTestCompany = true;
  console.log("Empresa de teste criada:", company.id);
}

const root = process.cwd();
const entradaKey = parseNfeXml(readFileSync(join(root, "nfe_entrada_152756.xml"))).accessKey;
const saidaKey = parseNfeXml(readFileSync(join(root, "nf.xml"))).accessKey;
const keysToCleanup = [entradaKey, saidaKey];

async function cleanup() {
  const docs = await db
    .select({ id: nfeDocuments.id })
    .from(nfeDocuments)
    .where(inArray(nfeDocuments.accessKey, keysToCleanup));

  const docIds = docs.map((d) => d.id);
  if (docIds.length === 0) return;

  await db.delete(nfeDocumentAttachments).where(inArray(nfeDocumentAttachments.nfeDocumentId, docIds));
  await db.delete(nfeDocumentTimeline).where(inArray(nfeDocumentTimeline.nfeDocumentId, docIds));
  await db.delete(nfeDocumentEvents).where(inArray(nfeDocumentEvents.nfeDocumentId, docIds));
  await db.delete(nfeDocuments).where(inArray(nfeDocuments.id, docIds));
}

async function runImport(fileName, label) {
  const buf = readFileSync(join(root, fileName));
  const result = await importNfeDocument(app, {
    organizationId,
    xmlBuffer: buf,
    fileName,
  });
  console.log(
    `OK ${label}:`,
    result.document.direction,
    result.document.status,
    result.document.accessKey?.slice(0, 8) + "..."
  );
  return result;
}

try {
  await cleanup();

  await runImport("nfe_entrada_152756.xml", "entrada");
  await runImport("nf.xml", "saída");

  try {
    await runImport("nf.xml", "duplicata");
    console.error("FAIL: duplicata deveria retornar erro");
    process.exitCode = 1;
  } catch (e) {
    if (e?.code === "nfe_document_duplicate") {
      console.log("OK duplicata: nfe_document_duplicate");
    } else {
      throw e;
    }
  }
} finally {
  await cleanup();
  if (createdTestCompany && company) {
    await db.delete(organizationCompanies).where(eq(organizationCompanies.id, company.id));
    console.log("Empresa de teste removida.");
  }
  await app.close();
  await pool.end();
}

if (!process.exitCode) console.log("Integração import NFe concluída.");
