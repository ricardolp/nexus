CREATE TYPE "public"."integration_provider" AS ENUM('sap_cpi');--> statement-breakpoint
CREATE TYPE "public"."integration_operation" AS ENUM('purchase_orders', 'inbound_delivery');--> statement-breakpoint
CREATE TABLE "integration_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"nfe_document_id" uuid,
	"provider" "integration_provider" NOT NULL,
	"operation" "integration_operation" NOT NULL,
	"http_method" varchar(8) NOT NULL,
	"request_url" text NOT NULL,
	"request_body" jsonb,
	"response_body" jsonb,
	"response_status" integer,
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_code" varchar(64),
	"error_message" text,
	"correlation_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "integration_request_logs" ADD CONSTRAINT "integration_request_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_request_logs" ADD CONSTRAINT "integration_request_logs_nfe_document_id_nfe_documents_id_fk" FOREIGN KEY ("nfe_document_id") REFERENCES "public"."nfe_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_request_logs_org_created_at_idx" ON "integration_request_logs" USING btree ("organization_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "integration_request_logs_nfe_document_id_idx" ON "integration_request_logs" USING btree ("nfe_document_id");--> statement-breakpoint
CREATE INDEX "integration_request_logs_org_operation_created_at_idx" ON "integration_request_logs" USING btree ("organization_id","operation","created_at" DESC);
