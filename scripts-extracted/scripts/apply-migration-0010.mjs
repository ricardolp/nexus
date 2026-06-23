/**
 * Applies migration 0010 when drizzle-kit migrate fails because 0009 tables
 * already exist. Safe to run multiple times (idempotent).
 */
import "dotenv/config";
import pg from "pg";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, "../src/db/migrations/0010_sticky_shape.sql");
const migrationSql = readFileSync(migrationPath, "utf8");
const migrationHash = createHash("sha256").update(migrationSql).digest("hex");
const journalWhen = 1779207861000;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `DO $$ BEGIN
    CREATE TYPE "public"."company_email_template_type" AS ENUM('nfe_issued', 'nfe_cancelled', 'nfe_cce', 'nfe_rejected');
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "organization_company_email_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "organization_company_id" uuid NOT NULL,
    "template_type" "company_email_template_type" NOT NULL,
    "subject" varchar(500),
    "body_html" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `DO $$ BEGIN
    ALTER TABLE "organization_company_email_templates"
      ADD CONSTRAINT "organization_company_email_templates_organization_company_id_organization_companies_id_fk"
      FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "organization_company_email_templates_company_id_type_unique"
    ON "organization_company_email_templates" USING btree ("organization_company_id", "template_type")`,
  `CREATE INDEX IF NOT EXISTS "organization_company_email_templates_company_id_idx"
    ON "organization_company_email_templates" USING btree ("organization_company_id")`,
];

try {
  const exists = await pool.query(
    "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1",
    [migrationHash]
  );
  if (exists.rowCount > 0) {
    console.log("Migration 0010 already recorded in __drizzle_migrations.");
  } else {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const sql of statements) {
        await client.query(sql);
      }
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [migrationHash, journalWhen]
      );
      await client.query("COMMIT");
      console.log("Migration 0010 applied successfully.");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  const check = await pool.query(
    "SELECT to_regclass('public.organization_company_email_templates') AS templates"
  );
  console.log("Table organization_company_email_templates:", check.rows[0].templates);
} finally {
  await pool.end();
}
