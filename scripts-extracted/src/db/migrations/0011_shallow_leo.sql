CREATE TYPE "public"."organization_integration_auth_type" AS ENUM('oauth2_client_credentials');--> statement-breakpoint
CREATE TABLE "organization_integration_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"cpi_base_url" varchar(2048),
	"client_id" varchar(255),
	"auth_type" "organization_integration_auth_type",
	"client_secret_secret_name" varchar(255),
	"client_secret_secret_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_integration_settings" ADD CONSTRAINT "organization_integration_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_integration_settings_organization_id_unique" ON "organization_integration_settings" USING btree ("organization_id");