/**
 * Restore completo: DROP SCHEMA public, migrate, seed único platform admin, FLUSHDB Redis.
 * Uso: npm run db:reset
 * Produção: exige ALLOW_DB_RESET=true ou flag --force
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import Redis from "ioredis";
import argon2 from "argon2";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DEFAULT_ADMIN_EMAIL = "admin@nexus.local";
const DEFAULT_ADMIN_PASSWORD = "Admin123!";
const DEFAULT_ADMIN_NAME = "Platform Admin";

function assertSafeToReset() {
  const force = process.argv.includes("--force");
  if (process.env.NODE_ENV === "production" && !force && process.env.ALLOW_DB_RESET !== "true") {
    console.error(
      "Abortado: NODE_ENV=production. Use ALLOW_DB_RESET=true ou npm run db:reset -- --force"
    );
    process.exit(1);
  }
}

async function resetPostgres(connectionString) {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    console.log("PostgreSQL: DROP SCHEMA drizzle + public CASCADE...");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO public");
    console.log("PostgreSQL: schemas recriados (journal Drizzle removido).");
  } finally {
    client.release();
    await pool.end();
  }
}

function runMigrations() {
  console.log("Aplicando migrations (drizzle-kit migrate)...");
  const result = spawnSync("npm", ["run", "db:migrate"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("db:migrate falhou");
  }
}

async function assertUsersTable(connectionString) {
  const pool = new pg.Pool({ connectionString });
  try {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`
    );
    if (r.rowCount === 0) {
      throw new Error('Tabela "users" não existe após migrate. Verifique DATABASE_URL e migrations.');
    }
  } finally {
    await pool.end();
  }
}

async function seedPlatformAdminInline(connectionString) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const name = (process.env.SEED_ADMIN_NAME ?? DEFAULT_ADMIN_NAME).slice(0, 255);
  const passwordHash = await argon2.hash(password);
  const now = new Date();

  const pool = new pg.Pool({ connectionString });
  try {
    const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [email]);
    if (existing.rowCount > 0) {
      await pool.query(
        `UPDATE users SET name = $1, password_hash = $2, role = 'admin', status = 'active',
         email_verified_at = $3, confirmed_at = $3, updated_at = $3 WHERE email = $4`,
        [name, passwordHash, now, email]
      );
      console.log(`Platform admin atualizado: ${email}`);
    } else {
      await pool.query(
        `INSERT INTO users (email, password_hash, name, role, status, email_verified_at, confirmed_at)
         VALUES ($1, $2, $3, 'admin', 'active', $4, $4)`,
        [email, passwordHash, name, now]
      );
      console.log(`Platform admin criado: ${email}`);
    }
    console.log(`Login: ${email} / ${process.env.SEED_ADMIN_PASSWORD ? "(SEED_ADMIN_PASSWORD)" : DEFAULT_ADMIN_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

async function flushRedis(redisUrl) {
  if (!redisUrl?.trim()) {
    console.warn("REDIS_URL ausente — pulando FLUSHDB.");
    return;
  }
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
    console.log("Redis: FLUSHDB concluído.");
  } finally {
    redis.disconnect();
  }
}

async function main() {
  assertSafeToReset();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    console.error("DATABASE_URL não definida.");
    process.exit(1);
  }

  await resetPostgres(databaseUrl);
  runMigrations();
  await assertUsersTable(databaseUrl);
  console.log("Seed platform admin...");
  await seedPlatformAdminInline(databaseUrl);
  await flushRedis(process.env.REDIS_URL);

  console.log("\nRestore completo.");
  console.log("  Próximo: npm run dev && npm run worker:nfe-inbound");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
