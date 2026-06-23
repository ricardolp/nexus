CREATE TYPE "public"."company_email_template_type" AS ENUM('nfe_issued', 'nfe_cancelled', 'nfe_cce', 'nfe_rejected');--> statement-breakpoint
CREATE TABLE "organization_company_email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"template_type" "company_email_template_type" NOT NULL,
	"subject" varchar(500),
	"body_html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_company_email_templates" ADD CONSTRAINT "organization_company_email_templates_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_company_email_templates_company_id_type_unique" ON "organization_company_email_templates" USING btree ("organization_company_id","template_type");--> statement-breakpoint
CREATE INDEX "organization_company_email_templates_company_id_idx" ON "organization_company_email_templates" USING btree ("organization_company_id");