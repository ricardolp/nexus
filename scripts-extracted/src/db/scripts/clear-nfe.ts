/**
 * Limpa NF-e da base para testes repetidos (sem apagar orgs/usuários/CPI).
 *
 * Uso:
 *   npm run db:clear:nfe
 *   npm run db:clear:nfe -- --company-id=<uuid>
 *   npm run db:clear:nfe -- --no-redis
 *   npm run db:clear:nfe -- --keep-ranges
 */
import "dotenv/config";
import { Queue } from "bullmq";
import { loadEnv } from "../../config/env.js";
import { createRedisConnection } from "../../redis.js";
import { createDb } from "../client.js";
import { clearNfeData } from "../clear-nfe.js";

function parseArgs(argv: string[]) {
  const companyId = argv.find((a) => a.startsWith("--company-id="))?.split("=")[1];
  const noRedis = argv.includes("--no-redis");
  const keepRanges = argv.includes("--keep-ranges");
  const force = argv.includes("--force");
  return { companyId, noRedis, keepRanges, force };
}

function assertSafeToClear(force: boolean) {
  if (
    process.env.NODE_ENV === "production" &&
    !force &&
    process.env.ALLOW_NFE_CLEAR !== "true"
  ) {
    console.error(
      "Abortado: NODE_ENV=production. Use ALLOW_NFE_CLEAR=true ou npm run db:clear:nfe -- --force"
    );
    process.exit(1);
  }
}

async function clearNfeInboundQueue(env: ReturnType<typeof loadEnv>) {
  const connection = createRedisConnection(env);
  const queue = new Queue("nfe-inbound", { connection });
  try {
    await queue.obliterate({ force: true });
    console.log("Redis: fila nfe-inbound obliterada.");
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function main() {
  const { companyId, noRedis, keepRanges, force } = parseArgs(process.argv.slice(2));
  assertSafeToClear(force);

  const env = loadEnv();
  const { db, pool } = createDb(env);

  try {
    console.log(
      companyId
        ? `Limpando NF-e da empresa ${companyId}...`
        : "Limpando todas as NF-e..."
    );

    const result = await clearNfeData(db, {
      organizationCompanyId: companyId,
      includeNumberRanges: !keepRanges,
    });

    if (result.documentsDeleted !== undefined) {
      console.log(`PostgreSQL: ${result.documentsDeleted} documento(s) removido(s).`);
      if (result.numberRangesDeleted !== undefined && result.numberRangesDeleted > 0) {
        console.log(`PostgreSQL: ${result.numberRangesDeleted} faixa(s) de numeração removida(s).`);
      }
    } else {
      console.log("PostgreSQL: tabelas NF-e truncadas (documentos, itens, inbound, SAP, anexos, eventos).");
      if (!keepRanges) {
        console.log("PostgreSQL: faixas de numeração truncadas.");
      }
    }

    if (!noRedis && env.REDIS_URL?.trim()) {
      await clearNfeInboundQueue(env);
    } else if (noRedis) {
      console.log("Redis: ignorado (--no-redis).");
    } else {
      console.warn("REDIS_URL ausente — fila nfe-inbound não limpa.");
    }

    console.log("\nClear NF-e concluído. Pode importar XML e rodar worker:nfe-inbound de novo.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
