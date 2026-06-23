CREATE TABLE "organization_company_emails_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"smtp_host" varchar(255),
	"smtp_port" integer,
	"smtp_username" varchar(255),
	"smtp_password_secret_name" varchar(255),
	"smtp_password_secret_id" text,
	"smtp_encryption" varchar(32),
	"from_email" varchar(320),
	"from_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_company_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"is_nfse_inbound_active" boolean DEFAULT false NOT NULL,
	"is_nfse_outbound_active" boolean DEFAULT false NOT NULL,
	"is_nfe_inbound_active" boolean DEFAULT false NOT NULL,
	"is_nfe_outbound_active" boolean DEFAULT false NOT NULL,
	"send_danfe_to_approve_outbound" boolean DEFAULT false NOT NULL,
	"send_xml_to_approve_outbound" boolean DEFAULT false NOT NULL,
	"send_xml_to_cancel_outbound" boolean DEFAULT false NOT NULL,
	"send_xml_to_cce_outbound" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "organization_certificates_company_id_active_unique";--> statement-breakpoint
DROP INDEX "organization_company_certificates_company_id_active_unique";--> statement-breakpoint
ALTER TABLE "organization_company_emails_settings" ADD CONSTRAINT "organization_company_emails_settings_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_company_settings" ADD CONSTRAINT "organization_company_settings_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_company_emails_settings_company_id_unique" ON "organization_company_emails_settings" USING btree ("organization_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_company_settings_company_id_unique" ON "organization_company_settings" USING btree ("organization_company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_certificates_company_id_active_unique" ON "organization_certificates" USING btree ("organization_company_id") WHERE "organization_certificates"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "organization_company_certificates_company_id_active_unique" ON "organization_companies_certificates" USING btree ("organization_company_id") WHERE "organization_companies_certificates"."status" = 'active';