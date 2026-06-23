CREATE TYPE "public"."certificate_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TABLE "organization_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cnpj" varchar(14) NOT NULL,
	"razao_social" varchar(300) NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"csrt" text,
	"hash_csrt" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_companies_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"name" varchar(255),
	"description" text,
	"status" "certificate_status" DEFAULT 'active' NOT NULL,
	"key_vault_cert_name" varchar(255) NOT NULL,
	"key_vault_cert_id" text NOT NULL,
	"key_vault_key_id" text,
	"password_secret_name" varchar(255) NOT NULL,
	"password_secret_id" text,
	"thumbprint" varchar(128),
	"subject" text,
	"issuer" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_companies" ADD CONSTRAINT "organization_companies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_companies_certificates" ADD CONSTRAINT "organization_companies_certificates_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_companies_org_id_cnpj_unique" ON "organization_companies" USING btree ("organization_id","cnpj");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_companies_org_id_slug_unique" ON "organization_companies" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "organization_companies_organization_id_idx" ON "organization_companies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_company_certificates_company_id_idx" ON "organization_companies_certificates" USING btree ("organization_company_id");