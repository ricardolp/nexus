import "dotenv/config";
import { eq } from "drizzle-orm";
import { loadEnv } from "../../config/env.js";
import { clearNfeData } from "../clear-nfe.js";
import { createDb } from "../client.js";
import {
  nfeDocumentAttachments,
  nfeDocumentEvents,
  nfeDocumentTimeline,
  nfeDocuments,
  nfeNumberRanges,
} from "../nfe-schema.js";
import { organizationCompanies, organizationRoles } from "../schema.js";

const PER_COMPANY = Number(process.env.NFE_SEED_PER_COMPANY ?? "60");
const FRESH = process.argv.includes("--fresh");

const STATUSES = [
  "authorized",
  "authorized",
  "authorized",
  "authorized",
  "authorized",
  "sent_to_sefaz",
  "waiting_processing",
  "validating",
  "draft",
  "rejected",
  "denied",
  "cancelled",
  "cancelled",
  "processing_error",
  "contingency",
  "closed",
] as const;

const RECIPIENT_NAMES = [
  "Distribuidora Alfa Ltda",
  "Comércio Beta S.A.",
  "Indústria Gama ME",
  "Atacado Delta Eireli",
  "Serviços Épsilon Ltda",
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomCnpj(): string {
  return Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join("");
}

function randomCpf(): string {
  return Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("");
}

function generateAccessKey(seed: number): string {
  const base = String(seed).padStart(44, "0");
  return base.slice(-44);
}

function randomAmount(): string {
  return (Math.random() * 49950 + 50).toFixed(2);
}

async function ensureNfeReadScope(db: ReturnType<typeof createDb>["db"]) {
  const roles = await db.select({ id: organizationRoles.id, scopes: organizationRoles.scopes }).from(organizationRoles);
  for (const role of roles) {
    const missing = ["nfe:read", "nfe:import", "nfe:update"].filter(
      (s) => !role.scopes.includes(s)
    );
    if (missing.length === 0) continue;
    await db
      .update(organizationRoles)
      .set({ scopes: [...role.scopes, ...missing] })
      .where(eq(organizationRoles.id, role.id));
  }
}

async function main() {
  const env = loadEnv();
  const { db, pool } = createDb(env);

  const companies = await db
    .select({
      id: organizationCompanies.id,
      cnpj: organizationCompanies.cnpj,
      displayName: organizationCompanies.displayName,
      organizationId: organizationCompanies.organizationId,
    })
    .from(organizationCompanies);

  if (companies.length === 0) {
    console.error("Nenhuma empresa encontrada. Crie organização e company antes do seed.");
    await pool.end();
    process.exit(1);
  }

  if (FRESH) {
    console.log("Limpando tabelas NFe...");
    await clearNfeData(db);
  }

  await ensureNfeReadScope(db);

  let globalKey = 1;
  let totalDocuments = 0;

  for (const company of companies) {
    let activeNumber = 1;
    let cancelledNumber = 900_000;

    for (let i = 0; i < PER_COMPANY; i++) {
      const status = pick(STATUSES);
      const direction = pick(["outbound", "inbound"] as const);
      const environment = pick(["production", "homologation"] as const);
      const series = pick([1, 55, 99]);
      const isCancelled = status === "cancelled";
      const number = isCancelled ? cancelledNumber++ : activeNumber++;
      const issuedAt = new Date(Date.now() - Math.floor(Math.random() * 30) * 86_400_000);
      const authorized =
        status === "authorized" || status === "cancelled" || status === "contingency";

      const [doc] = await db
        .insert(nfeDocuments)
        .values({
          organizationCompanyId: company.id,
          direction,
          environment,
          status,
          model: "55",
          series,
          number,
          accessKey: authorized ? generateAccessKey(globalKey++) : null,
          issuerCnpj: company.cnpj,
          recipientDocument: Math.random() > 0.2 ? randomCnpj() : randomCpf(),
          recipientName: pick(RECIPIENT_NAMES),
          totalAmount: randomAmount(),
          issuedAt,
          authorizedAt: authorized ? new Date(issuedAt.getTime() + 120_000) : null,
          cancelledAt: status === "cancelled" ? new Date(issuedAt.getTime() + 3_600_000) : null,
          authorizationProtocol: authorized ? String(1_000_000_000_000 + globalKey) : null,
          sefazStatusCode: status === "rejected" ? "302" : authorized ? "100" : "103",
          sefazStatusMessage:
            status === "rejected"
              ? "Rejeição: duplicidade de NF-e"
              : authorized
                ? "Autorizado o uso da NF-e"
                : "Lote recebido com sucesso",
          sapDocumentId: direction === "outbound" ? `SAP-${company.id.slice(0, 8)}-${number}` : null,
          sapOrderId: direction === "outbound" ? `PO-${number}` : null,
          idempotencyKey: `seed-${company.id}-${i}`,
          metadata: { seed: true, index: i },
        })
        .returning({ id: nfeDocuments.id });

      const docId = doc!.id;

      const [event] = await db
        .insert(nfeDocumentEvents)
        .values({
          nfeDocumentId: docId,
          eventType: isCancelled ? "cancellation" : authorized ? "authorization" : "xml_import",
          eventStatus: status === "rejected" ? "rejected" : authorized ? "accepted" : "sent",
          sequence: 1,
          sefazStatusCode: status === "rejected" ? "302" : "100",
          sefazStatusMessage: status === "rejected" ? "Rejeitada pela SEFAZ" : "Processado com sucesso",
          protocol: authorized ? String(1_000_000_000_000 + globalKey) : null,
          correlationId: `seed-event-${docId}`,
          requestSummary: { origin: "seed" },
          responseSummary: { status },
          startedAt: issuedAt,
          completedAt: new Date(issuedAt.getTime() + 60_000),
        })
        .returning({ id: nfeDocumentEvents.id });

      await db.insert(nfeDocumentTimeline).values([
        {
          nfeDocumentId: docId,
          nfeDocumentEventId: event!.id,
          source: "system",
          title: "Documento criado",
          message: `Nota ${number} série ${series} registrada no sistema.`,
        },
        {
          nfeDocumentId: docId,
          nfeDocumentEventId: event!.id,
          source: authorized ? "sefaz" : "job",
          title: authorized ? "Autorização SEFAZ" : "Processamento",
          message: authorized
            ? "NF-e autorizada para uso."
            : `Status atual: ${status}.`,
        },
      ]);

      if (authorized || status !== "draft") {
        await db.insert(nfeDocumentAttachments).values({
          nfeDocumentId: docId,
          nfeDocumentEventId: event!.id,
          kind: authorized ? "xml_authorized" : "xml_request",
          fileName: `NFe${number}.xml`,
          contentType: "application/xml",
          storageKey: `seed/nfe/${company.id}/${docId}/NFe${number}.xml`,
          sizeBytes: 12_000 + Math.floor(Math.random() * 40_000),
          checksumSha256: Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join(""),
        });
      }
    }

    await db.insert(nfeNumberRanges).values({
      organizationCompanyId: company.id,
      environment: "production",
      model: "55",
      series: 1,
      numberFrom: 900_001,
      numberTo: 900_010,
      justification: "Seed: faixa inutilizada para testes",
      protocol: "999000000000001",
      authorizedAt: new Date(),
    });

    totalDocuments += PER_COMPANY;
    console.log(`  ${company.displayName}: ${PER_COMPANY} documentos`);
  }

  console.log(`\nSeed NFe concluído: ${totalDocuments} documentos em ${companies.length} empresa(s).`);
  console.log("Scope nfe:read adicionado aos perfis existentes (quando ausente).");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
