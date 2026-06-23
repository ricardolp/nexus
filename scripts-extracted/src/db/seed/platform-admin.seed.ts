import "dotenv/config";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { loadEnv } from "../../config/env.js";
import { createDb } from "../client.js";
import { users } from "../schema.js";

const DEFAULT_EMAIL = "admin@nexus.local";
const DEFAULT_PASSWORD = "Admin123!";
const DEFAULT_NAME = "Platform Admin";

export async function seedPlatformAdmin(db: ReturnType<typeof createDb>["db"]) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? DEFAULT_EMAIL).toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_PASSWORD;
  const name = (process.env.SEED_ADMIN_NAME ?? DEFAULT_NAME).slice(0, 255);
  const passwordHash = await argon2.hash(password);
  const now = new Date();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        name,
        passwordHash,
        role: "admin",
        status: "active",
        emailVerifiedAt: now,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing.id));
    console.log(`Platform admin atualizado: ${email}`);
    return { email, created: false };
  }

  await db.insert(users).values({
    email,
    passwordHash,
    name,
    role: "admin",
    status: "active",
    emailVerifiedAt: now,
    confirmedAt: now,
  });

  console.log(`Platform admin criado: ${email}`);
  return { email, created: true };
}

async function main() {
  const env = loadEnv();
  const { db, pool } = createDb(env);
  try {
    const result = await seedPlatformAdmin(db);
    console.log(
      `Login: ${result.email} / ${process.env.SEED_ADMIN_PASSWORD ? "(SEED_ADMIN_PASSWORD)" : DEFAULT_PASSWORD}`
    );
  } finally {
    await pool.end();
  }
}

const isMain =
  process.argv[1]?.includes("platform-admin.seed") ||
  process.argv[1]?.endsWith("platform-admin.seed.ts");

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
