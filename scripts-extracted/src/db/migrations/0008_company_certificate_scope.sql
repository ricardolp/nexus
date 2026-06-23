WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_company_id
      ORDER BY created_at DESC
    ) AS rn
  FROM "organization_companies_certificates"
  WHERE status = 'active'::"certificate_status"
)
UPDATE "organization_companies_certificates" c
SET status = 'inactive'::"certificate_status", updated_at = now()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;--> statement-breakpoint
DELETE FROM "organization_certificates";--> statement-breakpoint
ALTER TABLE "organization_certificates" DROP CONSTRAINT "organization_certificates_organization_id_organizations_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "organization_certificates_organization_id_idx";--> statement-breakpoint
ALTER TABLE "organization_certificates" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "organization_certificates" ADD COLUMN "organization_company_id" uuid NOT NULL CONSTRAINT "organization_certificates_organization_company_id_organization_companies_id_fk" REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_certificates_organization_company_id_idx" ON "organization_certificates" USING btree ("organization_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_certificates_company_id_active_unique" ON "organization_certificates" USING btree ("organization_company_id") WHERE "organization_certificates"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_company_certificates_company_id_active_unique" ON "organization_companies_certificates" USING btree ("organization_company_id") WHERE "organization_companies_certificates"."status" = 'active';
