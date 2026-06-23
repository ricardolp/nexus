CREATE TYPE "public"."nfe_attachment_kind" AS ENUM('xml_request', 'xml_response', 'xml_authorized', 'xml_cancel', 'xml_correction_letter', 'xml_distribution', 'danfe_pdf', 'event_pdf', 'json_payload', 'txt_log', 'other');--> statement-breakpoint
CREATE TYPE "public"."nfe_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."nfe_document_status" AS ENUM('draft', 'received', 'validating', 'validation_error', 'waiting_processing', 'sent_to_sefaz', 'authorized', 'rejected', 'denied', 'cancel_requested', 'cancelled', 'cancel_rejected', 'inutilized', 'processing_error', 'contingency', 'closed');--> statement-breakpoint
CREATE TYPE "public"."nfe_environment" AS ENUM('production', 'homologation');--> statement-breakpoint
CREATE TYPE "public"."nfe_event_status" AS ENUM('pending', 'sent', 'accepted', 'rejected', 'error', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."nfe_event_type" AS ENUM('authorization', 'cancellation', 'cancellation_denied', 'correction_letter', 'manifestation_confirmation', 'manifestation_unknown', 'manifestation_not_performed', 'manifestation_awareness', 'epec', 'protocol_query', 'status_query', 'distribution_dfe', 'xml_import', 'xml_export', 'system_status_change', 'webhook_callback', 'sap_callback', 'manual_note');--> statement-breakpoint
CREATE TYPE "public"."nfe_number_range_event_type" AS ENUM('inutilization_requested', 'inutilization_authorized', 'inutilization_rejected', 'status_query', 'manual_note');--> statement-breakpoint
CREATE TYPE "public"."nfe_timeline_source" AS ENUM('system', 'user', 'sefaz', 'sap', 'webhook', 'job', 'api');--> statement-breakpoint
CREATE TABLE "nfe_document_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"nfe_document_event_id" uuid,
	"kind" "nfe_attachment_kind" NOT NULL,
	"file_name" varchar(512) NOT NULL,
	"content_type" varchar(128),
	"storage_key" text NOT NULL,
	"size_bytes" bigint,
	"checksum_sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_document_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"event_type" "nfe_event_type" NOT NULL,
	"event_status" "nfe_event_status" DEFAULT 'pending' NOT NULL,
	"sequence" integer NOT NULL,
	"sefaz_status_code" varchar(10),
	"sefaz_status_message" text,
	"protocol" varchar(20),
	"correlation_id" varchar(128),
	"request_summary" jsonb,
	"response_summary" jsonb,
	"error_code" varchar(64),
	"error_message" text,
	"triggered_by_user_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_document_timeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nfe_document_id" uuid NOT NULL,
	"nfe_document_event_id" uuid,
	"source" "nfe_timeline_source" NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"metadata" jsonb,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"direction" "nfe_direction" NOT NULL,
	"environment" "nfe_environment" NOT NULL,
	"status" "nfe_document_status" DEFAULT 'draft' NOT NULL,
	"model" varchar(2) DEFAULT '55' NOT NULL,
	"series" integer NOT NULL,
	"number" integer NOT NULL,
	"access_key" varchar(44),
	"issuer_cnpj" varchar(14) NOT NULL,
	"recipient_document" varchar(14),
	"recipient_name" varchar(300),
	"total_amount" numeric(15, 2),
	"issued_at" timestamp with time zone,
	"authorized_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"authorization_protocol" varchar(20),
	"cancellation_protocol" varchar(20),
	"sefaz_status_code" varchar(10),
	"sefaz_status_message" text,
	"sap_document_id" varchar(128),
	"sap_order_id" varchar(128),
	"idempotency_key" varchar(128),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_number_range_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nfe_number_range_id" uuid NOT NULL,
	"event_type" "nfe_number_range_event_type" NOT NULL,
	"event_status" "nfe_event_status" DEFAULT 'pending' NOT NULL,
	"sefaz_status_code" varchar(10),
	"sefaz_status_message" text,
	"protocol" varchar(20),
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfe_number_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_company_id" uuid NOT NULL,
	"environment" "nfe_environment" NOT NULL,
	"model" varchar(2) DEFAULT '55' NOT NULL,
	"series" integer NOT NULL,
	"number_from" integer NOT NULL,
	"number_to" integer NOT NULL,
	"justification" text,
	"protocol" varchar(20),
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nfe_document_attachments" ADD CONSTRAINT "nfe_document_attachments_nfe_document_id_nfe_documents_id_fk" FOREIGN KEY ("nfe_document_id") REFERENCES "public"."nfe_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_attachments" ADD CONSTRAINT "nfe_document_attachments_nfe_document_event_id_nfe_document_events_id_fk" FOREIGN KEY ("nfe_document_event_id") REFERENCES "public"."nfe_document_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_events" ADD CONSTRAINT "nfe_document_events_nfe_document_id_nfe_documents_id_fk" FOREIGN KEY ("nfe_document_id") REFERENCES "public"."nfe_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_events" ADD CONSTRAINT "nfe_document_events_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_timeline" ADD CONSTRAINT "nfe_document_timeline_nfe_document_id_nfe_documents_id_fk" FOREIGN KEY ("nfe_document_id") REFERENCES "public"."nfe_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_timeline" ADD CONSTRAINT "nfe_document_timeline_nfe_document_event_id_nfe_document_events_id_fk" FOREIGN KEY ("nfe_document_event_id") REFERENCES "public"."nfe_document_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_document_timeline" ADD CONSTRAINT "nfe_document_timeline_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_documents" ADD CONSTRAINT "nfe_documents_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_number_range_events" ADD CONSTRAINT "nfe_number_range_events_nfe_number_range_id_nfe_number_ranges_id_fk" FOREIGN KEY ("nfe_number_range_id") REFERENCES "public"."nfe_number_ranges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nfe_number_ranges" ADD CONSTRAINT "nfe_number_ranges_organization_company_id_organization_companies_id_fk" FOREIGN KEY ("organization_company_id") REFERENCES "public"."organization_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nfe_document_attachments_document_id_idx" ON "nfe_document_attachments" USING btree ("nfe_document_id");--> statement-breakpoint
CREATE INDEX "nfe_document_attachments_event_id_idx" ON "nfe_document_attachments" USING btree ("nfe_document_event_id");--> statement-breakpoint
CREATE INDEX "nfe_document_events_document_id_created_at_idx" ON "nfe_document_events" USING btree ("nfe_document_id","created_at");--> statement-breakpoint
CREATE INDEX "nfe_document_events_document_id_event_type_idx" ON "nfe_document_events" USING btree ("nfe_document_id","event_type");--> statement-breakpoint
CREATE INDEX "nfe_document_timeline_document_id_created_at_idx" ON "nfe_document_timeline" USING btree ("nfe_document_id","created_at");--> statement-breakpoint
CREATE INDEX "nfe_documents_company_id_status_idx" ON "nfe_documents" USING btree ("organization_company_id","status");--> statement-breakpoint
CREATE INDEX "nfe_documents_company_id_direction_env_idx" ON "nfe_documents" USING btree ("organization_company_id","direction","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_documents_access_key_unique" ON "nfe_documents" USING btree ("access_key");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_documents_company_id_idempotency_key_unique" ON "nfe_documents" USING btree ("organization_company_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_documents_company_active_number_unique" ON "nfe_documents" USING btree ("organization_company_id","model","series","number","environment") WHERE "nfe_documents"."status" NOT IN ('cancelled', 'inutilized');--> statement-breakpoint
CREATE INDEX "nfe_number_range_events_range_id_created_at_idx" ON "nfe_number_range_events" USING btree ("nfe_number_range_id","created_at");--> statement-breakpoint
CREATE INDEX "nfe_number_ranges_company_id_env_series_idx" ON "nfe_number_ranges" USING btree ("organization_company_id","environment","series");--> statement-breakpoint
CREATE UNIQUE INDEX "nfe_number_ranges_company_range_unique" ON "nfe_number_ranges" USING btree ("organization_company_id","environment","model","series","number_from","number_to");