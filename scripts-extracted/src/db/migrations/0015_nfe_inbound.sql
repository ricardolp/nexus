DO $$ BEGIN
  CREATE TYPE "public"."nfe_inbound_status" AS ENUM(
    'xml_imported',
    'sefaz_validated',
    'pedido_validating',
    'pedido_matched',
    'pedido_alert',
    'delivery_creating',
    'delivery_created',
    'awaiting_portaria',
    'migo_pending',
    'migo_done',
    'miro_pending',
    'miro_done',
    'rejected_inbound',
    'inbound_error'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."nfe_pedido_validation_status" AS ENUM(
    'pending',
    'matched',
    'alert',
    'skipped'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."nfe_sap_document_type" AS ENUM(
    'purchase_order',
    'inbound_delivery',
    'goods_movement',
    'invoice_verification',
    'accounting_doc'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."nfe_sap_document_status" AS ENUM(
    'pending',
    'success',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'inbound_status_change';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'pedido_validation';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'sap_delivery_create';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'sap_migo';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'sap_miro';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'inbound_rejection';
--> statement-breakpoint
ALTER TYPE "public"."nfe_event_type" ADD VALUE IF NOT EXISTS 'portaria_confirmation';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nfe_document_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nfe_document_id" uuid NOT NULL REFERENCES "nfe_documents"("id") ON DELETE cascade,
  "line_number" integer NOT NULL,
  "prod_codigo" varchar(60) NOT NULL,
  "descricao" varchar(500) NOT NULL,
  "ncm" varchar(8) NOT NULL DEFAULT '',
  "cfop" varchar(4) NOT NULL DEFAULT '',
  "qty" numeric(15, 4) NOT NULL,
  "uom" varchar(10) NOT NULL DEFAULT 'UN',
  "valor_total" numeric(15, 2) NOT NULL,
  "x_ped" varchar(60),
  "n_item_ped" varchar(20),
  "pedido_validation_status" "nfe_pedido_validation_status" NOT NULL DEFAULT 'pending',
  "pedido_validation_message" text,
  "sap_order_number" varchar(20),
  "sap_order_item" varchar(10),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "nfe_document_items_document_line_unique" ON "nfe_document_items" ("nfe_document_id", "line_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nfe_document_items_document_id_idx" ON "nfe_document_items" ("nfe_document_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nfe_inbound_process" (
  "nfe_document_id" uuid PRIMARY KEY NOT NULL REFERENCES "nfe_documents"("id") ON DELETE cascade,
  "inbound_status" "nfe_inbound_status" NOT NULL DEFAULT 'xml_imported',
  "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sefaz_validated_at" timestamp with time zone,
  "pedido_validated_at" timestamp with time zone,
  "delivery_created_at" timestamp with time zone,
  "portaria_confirmed_at" timestamp with time zone,
  "portaria_confirmed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "migo_completed_at" timestamp with time zone,
  "miro_completed_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "rejected_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "rejection_reason" text,
  "alert_code" varchar(64),
  "alert_message" text,
  "correlation_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nfe_inbound_process_status_idx" ON "nfe_inbound_process" ("inbound_status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "nfe_sap_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "nfe_document_id" uuid NOT NULL REFERENCES "nfe_documents"("id") ON DELETE cascade,
  "nfe_item_id" uuid REFERENCES "nfe_document_items"("id") ON DELETE set null,
  "document_type" "nfe_sap_document_type" NOT NULL,
  "doc_number" varchar(20) NOT NULL,
  "item_number" varchar(10),
  "fiscal_year" varchar(4),
  "status" "nfe_sap_document_status" NOT NULL DEFAULT 'pending',
  "raw_response" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nfe_sap_documents_document_id_idx" ON "nfe_sap_documents" ("nfe_document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nfe_sap_documents_document_type_idx" ON "nfe_sap_documents" ("nfe_document_id", "document_type");
