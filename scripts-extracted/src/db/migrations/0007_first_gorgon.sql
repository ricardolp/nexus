ALTER TYPE "public"."certificate_status" ADD VALUE 'expired';--> statement-breakpoint
ALTER TYPE "public"."certificate_status" ADD VALUE 'revoked';--> statement-breakpoint
CREATE TABLE "organization_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(255),
	"description" text,
	"status" "certificate_status" DEFAULT 'active' NOT NULL,
	"key_vault_cert_name" varchar(255) NOT NULL,
	"key_vault_cert_id" text NOT NULL,
	"key_vault_key_id" text,
	"password_secret_name" varchar(255),
	"password_secret_id" text,
	"thumbprint" varchar(128),
	"subject" text,
	"issuer" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_certificates" ADD CONSTRAINT "organization_certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_certificates_organization_id_idx" ON "organization_certificates" USING btree ("organization_id");