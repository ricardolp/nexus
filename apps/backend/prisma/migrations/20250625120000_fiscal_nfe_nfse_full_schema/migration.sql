-- NFe enums
CREATE TYPE "fiscal_nfe_environment" AS ENUM ('production', 'homologation');
CREATE TYPE "fiscal_nfe_document_status" AS ENUM ('draft', 'received', 'validating', 'validation_error', 'waiting_processing', 'sent_to_sefaz', 'authorized', 'rejected', 'denied', 'cancel_requested', 'cancelled', 'cancel_rejected', 'inutilized', 'processing_error', 'contingency', 'closed');
CREATE TYPE "fiscal_nfe_event_type" AS ENUM ('authorization', 'cancellation', 'cancellation_denied', 'correction_letter', 'manifestation_confirmation', 'manifestation_unknown', 'manifestation_not_performed', 'manifestation_awareness', 'epec', 'protocol_query', 'status_query', 'distribution_dfe', 'xml_import', 'xml_export', 'system_status_change', 'webhook_callback', 'sap_callback', 'manual_note', 'inbound_status_change', 'pedido_validation', 'sap_delivery_create', 'sap_migo', 'sap_miro', 'inbound_rejection', 'portaria_confirmation');
CREATE TYPE "fiscal_nfe_inbound_status" AS ENUM ('xml_imported', 'sefaz_validated', 'pedido_validating', 'pedido_matched', 'pedido_alert', 'delivery_creating', 'delivery_created', 'awaiting_portaria', 'migo_pending', 'migo_done', 'miro_pending', 'miro_done', 'rejected_inbound', 'inbound_error');
CREATE TYPE "fiscal_nfe_pedido_validation_status" AS ENUM ('pending', 'matched', 'alert', 'skipped');
CREATE TYPE "fiscal_nfe_sap_document_type" AS ENUM ('purchase_order', 'inbound_delivery', 'goods_movement', 'invoice_verification', 'accounting_doc');
CREATE TYPE "fiscal_nfe_sap_document_status" AS ENUM ('pending', 'success', 'error');
CREATE TYPE "fiscal_nfe_event_status" AS ENUM ('pending', 'sent', 'accepted', 'rejected', 'error', 'ignored');
CREATE TYPE "fiscal_nfe_timeline_source" AS ENUM ('system', 'user', 'sefaz', 'sap', 'webhook', 'job', 'api');
CREATE TYPE "fiscal_nfe_attachment_kind" AS ENUM ('xml_request', 'xml_response', 'xml_authorized', 'xml_cancel', 'xml_correction_letter', 'xml_distribution', 'danfe_pdf', 'event_pdf', 'json_payload', 'txt_log', 'other');
CREATE TYPE "fiscal_nfe_number_range_event_type" AS ENUM ('inutilization_requested', 'inutilization_authorized', 'inutilization_rejected', 'status_query', 'manual_note');

-- NFSe enums
CREATE TYPE "fiscal_nfse_environment" AS ENUM ('production', 'homologation');
CREATE TYPE "fiscal_nfse_document_status" AS ENUM ('draft', 'received', 'validating', 'validation_error', 'waiting_processing', 'sent_to_prefeitura', 'authorized', 'rejected', 'denied', 'cancel_requested', 'cancelled', 'cancel_rejected', 'substituted', 'processing_error', 'closed');
CREATE TYPE "fiscal_nfse_event_type" AS ENUM ('authorization', 'cancellation', 'cancellation_denied', 'correction_letter', 'substitution', 'service_taken', 'xml_import', 'xml_export', 'system_status_change', 'webhook_callback', 'sap_callback', 'manual_note', 'inbound_status_change', 'pedido_validation', 'sap_delivery_create', 'sap_migo', 'sap_miro', 'inbound_rejection', 'portaria_confirmation');
CREATE TYPE "fiscal_nfse_inbound_status" AS ENUM ('xml_imported', 'prefeitura_validated', 'pedido_validating', 'pedido_matched', 'pedido_alert', 'delivery_creating', 'delivery_created', 'awaiting_portaria', 'migo_pending', 'migo_done', 'miro_pending', 'miro_done', 'rejected_inbound', 'inbound_error');
CREATE TYPE "fiscal_nfse_pedido_validation_status" AS ENUM ('pending', 'matched', 'alert', 'skipped');
CREATE TYPE "fiscal_nfse_sap_document_type" AS ENUM ('purchase_order', 'inbound_delivery', 'goods_movement', 'invoice_verification', 'accounting_doc');
CREATE TYPE "fiscal_nfse_sap_document_status" AS ENUM ('pending', 'success', 'error');
CREATE TYPE "fiscal_nfse_event_status" AS ENUM ('pending', 'sent', 'accepted', 'rejected', 'error', 'ignored');
CREATE TYPE "fiscal_nfse_timeline_source" AS ENUM ('system', 'user', 'prefeitura', 'sap', 'webhook', 'job', 'api');
CREATE TYPE "fiscal_nfse_attachment_kind" AS ENUM ('xml_request', 'xml_response', 'xml_authorized', 'xml_cancel', 'xml_correction_letter', 'pdf_nfse', 'event_pdf', 'json_payload', 'txt_log', 'other');
CREATE TYPE "fiscal_nfse_number_range_event_type" AS ENUM ('inutilization_requested', 'inutilization_authorized', 'inutilization_rejected', 'status_query', 'manual_note');

-- Expand fiscal_nfe_documents
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "environment" "fiscal_nfe_environment";
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "model" VARCHAR(2) NOT NULL DEFAULT '55';
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "series" INTEGER;
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "number" INTEGER;
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "issuer_cnpj" VARCHAR(14);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "recipient_document" VARCHAR(14);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "recipient_name" VARCHAR(300);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "total_amount" DECIMAL(15,2);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "issued_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "authorized_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "authorization_protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "cancellation_protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "sefaz_status_code" VARCHAR(10);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "sefaz_status_message" TEXT;
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "sap_document_id" VARCHAR(128);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "sap_order_id" VARCHAR(128);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "idempotency_key" VARCHAR(128);
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "metadata" JSONB;
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "status_new" "fiscal_nfe_document_status";

UPDATE "fiscal_nfe_documents" d SET
  "company_id" = COALESCE(d."company_id", (
    SELECT c."id" FROM "organization_companies" c
    WHERE c."organization_id" = d."organization_id" AND c."deleted_at" IS NULL
    ORDER BY c."created_at" ASC LIMIT 1
  )),
  "environment" = COALESCE(d."environment", 'homologation'::"fiscal_nfe_environment"),
  "series" = COALESCE(d."series", 1),
  "number" = COALESCE(d."number", 1),
  "issuer_cnpj" = COALESCE(d."issuer_cnpj", (
    SELECT c."cnpj" FROM "organization_companies" c WHERE c."id" = COALESCE(d."company_id", (
      SELECT c2."id" FROM "organization_companies" c2
      WHERE c2."organization_id" = d."organization_id" AND c2."deleted_at" IS NULL
      ORDER BY c2."created_at" ASC LIMIT 1
    ))
  )),
  "status_new" = CASE d."status"::text
    WHEN 'draft' THEN 'draft'::"fiscal_nfe_document_status"
    WHEN 'emitted' THEN 'sent_to_sefaz'::"fiscal_nfe_document_status"
    WHEN 'authorized' THEN 'authorized'::"fiscal_nfe_document_status"
    WHEN 'rejected' THEN 'rejected'::"fiscal_nfe_document_status"
    WHEN 'cancelled' THEN 'cancelled'::"fiscal_nfe_document_status"
    ELSE 'draft'::"fiscal_nfe_document_status"
  END;

ALTER TABLE "fiscal_nfe_documents" DROP COLUMN "status";
ALTER TABLE "fiscal_nfe_documents" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "environment" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "series" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "issuer_cnpj" SET NOT NULL;
ALTER TABLE "fiscal_nfe_documents" ALTER COLUMN "access_key" TYPE VARCHAR(44);

-- Expand fiscal_nfse_documents (mirror)
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "environment" "fiscal_nfse_environment";
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "model" VARCHAR(10) NOT NULL DEFAULT 'NFSe';
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "series" INTEGER;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "number" INTEGER;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "issuer_cnpj" VARCHAR(14);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "recipient_document" VARCHAR(14);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "recipient_name" VARCHAR(300);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "total_amount" DECIMAL(15,2);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "issued_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "authorized_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "authorization_protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "cancellation_protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "prefeitura_status_code" VARCHAR(10);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "prefeitura_status_message" TEXT;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "sap_document_id" VARCHAR(128);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "sap_order_id" VARCHAR(128);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "idempotency_key" VARCHAR(128);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "metadata" JSONB;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "rps_number" INTEGER;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "rps_series" VARCHAR(10);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "verification_code" VARCHAR(64);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "service_code" VARCHAR(20);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "municipality_code" VARCHAR(7);
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "iss_retained" BOOLEAN;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "service_description" TEXT;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "status_new" "fiscal_nfse_document_status";

UPDATE "fiscal_nfse_documents" d SET
  "company_id" = COALESCE(d."company_id", (
    SELECT c."id" FROM "organization_companies" c
    WHERE c."organization_id" = d."organization_id" AND c."deleted_at" IS NULL
    ORDER BY c."created_at" ASC LIMIT 1
  )),
  "environment" = COALESCE(d."environment", 'homologation'::"fiscal_nfse_environment"),
  "series" = COALESCE(d."series", 1),
  "number" = COALESCE(d."number", 1),
  "issuer_cnpj" = COALESCE(d."issuer_cnpj", (
    SELECT c."cnpj" FROM "organization_companies" c WHERE c."id" = COALESCE(d."company_id", (
      SELECT c2."id" FROM "organization_companies" c2
      WHERE c2."organization_id" = d."organization_id" AND c2."deleted_at" IS NULL
      ORDER BY c2."created_at" ASC LIMIT 1
    ))
  )),
  "status_new" = CASE d."status"::text
    WHEN 'draft' THEN 'draft'::"fiscal_nfse_document_status"
    WHEN 'emitted' THEN 'sent_to_prefeitura'::"fiscal_nfse_document_status"
    WHEN 'authorized' THEN 'authorized'::"fiscal_nfse_document_status"
    WHEN 'rejected' THEN 'rejected'::"fiscal_nfse_document_status"
    WHEN 'cancelled' THEN 'cancelled'::"fiscal_nfse_document_status"
    ELSE 'draft'::"fiscal_nfse_document_status"
  END;

ALTER TABLE "fiscal_nfse_documents" DROP COLUMN "status";
ALTER TABLE "fiscal_nfse_documents" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "environment" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "series" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "number" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "issuer_cnpj" SET NOT NULL;
ALTER TABLE "fiscal_nfse_documents" ALTER COLUMN "access_key" TYPE VARCHAR(44);

-- Expand fiscal_nfe_document_events
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "event_type_new" "fiscal_nfe_event_type";
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "event_status" "fiscal_nfe_event_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "sefaz_status_code" VARCHAR(10);
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "sefaz_status_message" TEXT;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "correlation_id" VARCHAR(128);
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "request_summary" JSONB;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "response_summary" JSONB;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "error_code" VARCHAR(64);
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "error_message" TEXT;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "triggered_by_user_id" UUID;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "started_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "fiscal_nfe_document_events" SET
  "event_type_new" = COALESCE(
    CASE "event_type"
      WHEN 'authorization' THEN 'authorization'::"fiscal_nfe_event_type"
      WHEN 'cancellation' THEN 'cancellation'::"fiscal_nfe_event_type"
      ELSE 'manual_note'::"fiscal_nfe_event_type"
    END,
    'manual_note'::"fiscal_nfe_event_type"
  ),
  "event_status" = CASE "status"::text
    WHEN 'draft' THEN 'pending'::"fiscal_nfe_event_status"
    WHEN 'authorized' THEN 'accepted'::"fiscal_nfe_event_status"
    WHEN 'rejected' THEN 'rejected'::"fiscal_nfe_event_status"
    ELSE 'pending'::"fiscal_nfe_event_status"
  END;

ALTER TABLE "fiscal_nfe_document_events" DROP COLUMN "event_type";
ALTER TABLE "fiscal_nfe_document_events" DROP COLUMN "status";
ALTER TABLE "fiscal_nfe_document_events" RENAME COLUMN "event_type_new" TO "event_type";
ALTER TABLE "fiscal_nfe_document_events" ALTER COLUMN "event_type" SET NOT NULL;

-- Expand fiscal_nfse_document_events
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "event_type_new" "fiscal_nfse_event_type";
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "event_status" "fiscal_nfse_event_status" NOT NULL DEFAULT 'pending';
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "prefeitura_status_code" VARCHAR(10);
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "prefeitura_status_message" TEXT;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "protocol" VARCHAR(20);
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "correlation_id" VARCHAR(128);
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "request_summary" JSONB;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "response_summary" JSONB;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "error_code" VARCHAR(64);
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "error_message" TEXT;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "triggered_by_user_id" UUID;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "started_at" TIMESTAMP(3);
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "completed_at" TIMESTAMP(3);

UPDATE "fiscal_nfse_document_events" SET
  "event_type_new" = COALESCE(
    CASE "event_type"
      WHEN 'authorization' THEN 'authorization'::"fiscal_nfse_event_type"
      WHEN 'cancellation' THEN 'cancellation'::"fiscal_nfse_event_type"
      ELSE 'manual_note'::"fiscal_nfse_event_type"
    END,
    'manual_note'::"fiscal_nfse_event_type"
  ),
  "event_status" = CASE "status"::text
    WHEN 'draft' THEN 'pending'::"fiscal_nfse_event_status"
    WHEN 'authorized' THEN 'accepted'::"fiscal_nfse_event_status"
    WHEN 'rejected' THEN 'rejected'::"fiscal_nfse_event_status"
    ELSE 'pending'::"fiscal_nfse_event_status"
  END;

ALTER TABLE "fiscal_nfse_document_events" DROP COLUMN "event_type";
ALTER TABLE "fiscal_nfse_document_events" DROP COLUMN "status";
ALTER TABLE "fiscal_nfse_document_events" RENAME COLUMN "event_type_new" TO "event_type";
ALTER TABLE "fiscal_nfse_document_events" ALTER COLUMN "event_type" SET NOT NULL;

-- New NFe tables
CREATE TABLE "fiscal_nfe_document_timeline" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "event_id" UUID,
    "source" "fiscal_nfe_timeline_source" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_document_timeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfe_document_attachments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "event_id" UUID,
    "kind" "fiscal_nfe_attachment_kind" NOT NULL,
    "file_name" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(128),
    "storage_key" TEXT NOT NULL,
    "content" TEXT,
    "size_bytes" BIGINT,
    "checksum_sha256" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_document_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfe_number_ranges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "environment" "fiscal_nfe_environment" NOT NULL,
    "model" VARCHAR(2) NOT NULL DEFAULT '55',
    "series" INTEGER NOT NULL,
    "number_from" INTEGER NOT NULL,
    "number_to" INTEGER NOT NULL,
    "justification" TEXT,
    "protocol" VARCHAR(20),
    "authorized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_number_ranges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfe_number_range_events" (
    "id" UUID NOT NULL,
    "number_range_id" UUID NOT NULL,
    "event_type" "fiscal_nfe_number_range_event_type" NOT NULL,
    "event_status" "fiscal_nfe_event_status" NOT NULL DEFAULT 'pending',
    "sefaz_status_code" VARCHAR(10),
    "sefaz_status_message" TEXT,
    "protocol" VARCHAR(20),
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_number_range_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfe_document_items" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "prod_codigo" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(500) NOT NULL,
    "ncm" VARCHAR(8) NOT NULL DEFAULT '',
    "cfop" VARCHAR(4) NOT NULL DEFAULT '',
    "qty" DECIMAL(15,4) NOT NULL,
    "uom" VARCHAR(10) NOT NULL DEFAULT 'UN',
    "valor_total" DECIMAL(15,2) NOT NULL,
    "x_ped" VARCHAR(60),
    "n_item_ped" VARCHAR(20),
    "pedido_validation_status" "fiscal_nfe_pedido_validation_status" NOT NULL DEFAULT 'pending',
    "pedido_validation_message" TEXT,
    "sap_order_number" VARCHAR(20),
    "sap_order_item" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_document_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfe_inbound_process" (
    "document_id" UUID NOT NULL,
    "inbound_status" "fiscal_nfe_inbound_status" NOT NULL DEFAULT 'xml_imported',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sefaz_validated_at" TIMESTAMP(3),
    "pedido_validated_at" TIMESTAMP(3),
    "delivery_created_at" TIMESTAMP(3),
    "portaria_confirmed_at" TIMESTAMP(3),
    "portaria_confirmed_by_user_id" UUID,
    "migo_completed_at" TIMESTAMP(3),
    "miro_completed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejected_by_user_id" UUID,
    "rejection_reason" TEXT,
    "alert_code" VARCHAR(64),
    "alert_message" TEXT,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_inbound_process_pkey" PRIMARY KEY ("document_id")
);

CREATE TABLE "fiscal_nfe_sap_documents" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "item_id" UUID,
    "document_type" "fiscal_nfe_sap_document_type" NOT NULL,
    "doc_number" VARCHAR(20) NOT NULL,
    "item_number" VARCHAR(10),
    "fiscal_year" VARCHAR(4),
    "status" "fiscal_nfe_sap_document_status" NOT NULL DEFAULT 'pending',
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfe_sap_documents_pkey" PRIMARY KEY ("id")
);

-- New NFSe tables (mirror)
CREATE TABLE "fiscal_nfse_document_timeline" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "event_id" UUID,
    "source" "fiscal_nfse_timeline_source" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_document_timeline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfse_document_attachments" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "event_id" UUID,
    "kind" "fiscal_nfse_attachment_kind" NOT NULL,
    "file_name" VARCHAR(512) NOT NULL,
    "content_type" VARCHAR(128),
    "storage_key" TEXT NOT NULL,
    "content" TEXT,
    "size_bytes" BIGINT,
    "checksum_sha256" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_document_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfse_number_ranges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "environment" "fiscal_nfse_environment" NOT NULL,
    "model" VARCHAR(10) NOT NULL DEFAULT 'NFSe',
    "series" INTEGER NOT NULL,
    "number_from" INTEGER NOT NULL,
    "number_to" INTEGER NOT NULL,
    "justification" TEXT,
    "protocol" VARCHAR(20),
    "authorized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_number_ranges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfse_number_range_events" (
    "id" UUID NOT NULL,
    "number_range_id" UUID NOT NULL,
    "event_type" "fiscal_nfse_number_range_event_type" NOT NULL,
    "event_status" "fiscal_nfse_event_status" NOT NULL DEFAULT 'pending',
    "prefeitura_status_code" VARCHAR(10),
    "prefeitura_status_message" TEXT,
    "protocol" VARCHAR(20),
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_number_range_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfse_document_items" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "line_number" INTEGER NOT NULL,
    "prod_codigo" VARCHAR(60) NOT NULL,
    "descricao" VARCHAR(500) NOT NULL,
    "service_code" VARCHAR(20) NOT NULL DEFAULT '',
    "municipality_code" VARCHAR(7) NOT NULL DEFAULT '',
    "qty" DECIMAL(15,4) NOT NULL,
    "uom" VARCHAR(10) NOT NULL DEFAULT 'UN',
    "valor_total" DECIMAL(15,2) NOT NULL,
    "x_ped" VARCHAR(60),
    "n_item_ped" VARCHAR(20),
    "pedido_validation_status" "fiscal_nfse_pedido_validation_status" NOT NULL DEFAULT 'pending',
    "pedido_validation_message" TEXT,
    "sap_order_number" VARCHAR(20),
    "sap_order_item" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_document_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_nfse_inbound_process" (
    "document_id" UUID NOT NULL,
    "inbound_status" "fiscal_nfse_inbound_status" NOT NULL DEFAULT 'xml_imported',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prefeitura_validated_at" TIMESTAMP(3),
    "pedido_validated_at" TIMESTAMP(3),
    "delivery_created_at" TIMESTAMP(3),
    "portaria_confirmed_at" TIMESTAMP(3),
    "portaria_confirmed_by_user_id" UUID,
    "migo_completed_at" TIMESTAMP(3),
    "miro_completed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "rejected_by_user_id" UUID,
    "rejection_reason" TEXT,
    "alert_code" VARCHAR(64),
    "alert_message" TEXT,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_inbound_process_pkey" PRIMARY KEY ("document_id")
);

CREATE TABLE "fiscal_nfse_sap_documents" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "item_id" UUID,
    "document_type" "fiscal_nfse_sap_document_type" NOT NULL,
    "doc_number" VARCHAR(20) NOT NULL,
    "item_number" VARCHAR(10),
    "fiscal_year" VARCHAR(4),
    "status" "fiscal_nfse_sap_document_status" NOT NULL DEFAULT 'pending',
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "fiscal_nfse_sap_documents_pkey" PRIMARY KEY ("id")
);

-- Migrate numbering events to number ranges
INSERT INTO "fiscal_nfe_number_ranges" ("id", "organization_id", "company_id", "environment", "model", "series", "number_from", "number_to", "justification", "created_at", "updated_at")
SELECT gen_random_uuid(), "organization_id", "company_id", 'homologation'::"fiscal_nfe_environment", '55', 1, 1, 1, 'Migrated from numbering event', "created_at", "updated_at"
FROM "fiscal_nfe_numbering_events" WHERE "deleted_at" IS NULL;

INSERT INTO "fiscal_nfe_number_range_events" ("id", "number_range_id", "event_type", "event_status", "created_at", "updated_at")
SELECT gen_random_uuid(), nr."id", 'manual_note'::"fiscal_nfe_number_range_event_type", 'accepted'::"fiscal_nfe_event_status", ne."created_at", ne."updated_at"
FROM "fiscal_nfe_numbering_events" ne
JOIN "fiscal_nfe_number_ranges" nr ON nr."organization_id" = ne."organization_id" AND nr."company_id" = ne."company_id" AND nr."justification" = 'Migrated from numbering event'
WHERE ne."deleted_at" IS NULL;

INSERT INTO "fiscal_nfse_number_ranges" ("id", "organization_id", "company_id", "environment", "model", "series", "number_from", "number_to", "justification", "created_at", "updated_at")
SELECT gen_random_uuid(), "organization_id", "company_id", 'homologation'::"fiscal_nfse_environment", 'NFSe', 1, 1, 1, 'Migrated from numbering event', "created_at", "updated_at"
FROM "fiscal_nfse_numbering_events" WHERE "deleted_at" IS NULL;

INSERT INTO "fiscal_nfse_number_range_events" ("id", "number_range_id", "event_type", "event_status", "created_at", "updated_at")
SELECT gen_random_uuid(), nr."id", 'manual_note'::"fiscal_nfse_number_range_event_type", 'accepted'::"fiscal_nfse_event_status", ne."created_at", ne."updated_at"
FROM "fiscal_nfse_numbering_events" ne
JOIN "fiscal_nfse_number_ranges" nr ON nr."organization_id" = ne."organization_id" AND nr."company_id" = ne."company_id" AND nr."justification" = 'Migrated from numbering event'
WHERE ne."deleted_at" IS NULL;

DROP TABLE "fiscal_nfe_numbering_events";
DROP TABLE "fiscal_nfse_numbering_events";

-- Indexes
CREATE INDEX "fiscal_nfe_documents_company_id_status_idx" ON "fiscal_nfe_documents"("company_id", "status");
CREATE INDEX "fiscal_nfe_documents_company_id_direction_environment_idx" ON "fiscal_nfe_documents"("company_id", "direction", "environment");
CREATE UNIQUE INDEX "fiscal_nfe_documents_access_key_unique" ON "fiscal_nfe_documents"("access_key") WHERE "access_key" IS NOT NULL;
CREATE UNIQUE INDEX "fiscal_nfe_documents_company_id_idempotency_key_unique" ON "fiscal_nfe_documents"("company_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "fiscal_nfe_documents_company_active_number_unique" ON "fiscal_nfe_documents"("company_id", "model", "series", "number", "environment") WHERE "status" NOT IN ('cancelled', 'inutilized');

CREATE INDEX "fiscal_nfse_documents_company_id_status_idx" ON "fiscal_nfse_documents"("company_id", "status");
CREATE INDEX "fiscal_nfse_documents_company_id_direction_environment_idx" ON "fiscal_nfse_documents"("company_id", "direction", "environment");
CREATE UNIQUE INDEX "fiscal_nfse_documents_access_key_unique" ON "fiscal_nfse_documents"("access_key") WHERE "access_key" IS NOT NULL;
CREATE UNIQUE INDEX "fiscal_nfse_documents_company_id_idempotency_key_unique" ON "fiscal_nfse_documents"("company_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "fiscal_nfse_documents_company_active_number_unique" ON "fiscal_nfse_documents"("company_id", "model", "series", "number", "environment") WHERE "status" NOT IN ('cancelled', 'substituted');

CREATE INDEX "fiscal_nfe_document_events_document_id_created_at_idx" ON "fiscal_nfe_document_events"("document_id", "created_at");
CREATE INDEX "fiscal_nfe_document_events_document_id_event_type_idx" ON "fiscal_nfe_document_events"("document_id", "event_type");
CREATE INDEX "fiscal_nfse_document_events_document_id_created_at_idx" ON "fiscal_nfse_document_events"("document_id", "created_at");
CREATE INDEX "fiscal_nfse_document_events_document_id_event_type_idx" ON "fiscal_nfse_document_events"("document_id", "event_type");

CREATE INDEX "fiscal_nfe_document_timeline_document_id_created_at_idx" ON "fiscal_nfe_document_timeline"("document_id", "created_at");
CREATE INDEX "fiscal_nfse_document_timeline_document_id_created_at_idx" ON "fiscal_nfse_document_timeline"("document_id", "created_at");
CREATE INDEX "fiscal_nfe_document_attachments_document_id_idx" ON "fiscal_nfe_document_attachments"("document_id");
CREATE INDEX "fiscal_nfe_document_attachments_event_id_idx" ON "fiscal_nfe_document_attachments"("event_id");
CREATE INDEX "fiscal_nfse_document_attachments_document_id_idx" ON "fiscal_nfse_document_attachments"("document_id");
CREATE INDEX "fiscal_nfse_document_attachments_event_id_idx" ON "fiscal_nfse_document_attachments"("event_id");

CREATE INDEX "fiscal_nfe_number_ranges_company_id_env_series_idx" ON "fiscal_nfe_number_ranges"("company_id", "environment", "series");
CREATE UNIQUE INDEX "fiscal_nfe_number_ranges_company_range_unique" ON "fiscal_nfe_number_ranges"("company_id", "environment", "model", "series", "number_from", "number_to");
CREATE INDEX "fiscal_nfse_number_ranges_company_id_env_series_idx" ON "fiscal_nfse_number_ranges"("company_id", "environment", "series");
CREATE UNIQUE INDEX "fiscal_nfse_number_ranges_company_range_unique" ON "fiscal_nfse_number_ranges"("company_id", "environment", "model", "series", "number_from", "number_to");

CREATE INDEX "fiscal_nfe_number_range_events_range_id_created_at_idx" ON "fiscal_nfe_number_range_events"("number_range_id", "created_at");
CREATE INDEX "fiscal_nfse_number_range_events_range_id_created_at_idx" ON "fiscal_nfse_number_range_events"("number_range_id", "created_at");

CREATE UNIQUE INDEX "fiscal_nfe_document_items_document_line_unique" ON "fiscal_nfe_document_items"("document_id", "line_number");
CREATE INDEX "fiscal_nfe_document_items_document_id_idx" ON "fiscal_nfe_document_items"("document_id");
CREATE UNIQUE INDEX "fiscal_nfse_document_items_document_line_unique" ON "fiscal_nfse_document_items"("document_id", "line_number");
CREATE INDEX "fiscal_nfse_document_items_document_id_idx" ON "fiscal_nfse_document_items"("document_id");

CREATE INDEX "fiscal_nfe_sap_documents_document_id_idx" ON "fiscal_nfe_sap_documents"("document_id");
CREATE INDEX "fiscal_nfe_sap_documents_document_id_document_type_idx" ON "fiscal_nfe_sap_documents"("document_id", "document_type");
CREATE INDEX "fiscal_nfse_sap_documents_document_id_idx" ON "fiscal_nfse_sap_documents"("document_id");
CREATE INDEX "fiscal_nfse_sap_documents_document_id_document_type_idx" ON "fiscal_nfse_sap_documents"("document_id", "document_type");

-- Foreign keys
ALTER TABLE "fiscal_nfe_document_events" ADD CONSTRAINT "fiscal_nfe_document_events_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_events" ADD CONSTRAINT "fiscal_nfse_document_events_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_document_timeline" ADD CONSTRAINT "fiscal_nfe_document_timeline_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_document_timeline" ADD CONSTRAINT "fiscal_nfe_document_timeline_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "fiscal_nfe_document_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_document_timeline" ADD CONSTRAINT "fiscal_nfe_document_timeline_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfse_document_timeline" ADD CONSTRAINT "fiscal_nfse_document_timeline_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_timeline" ADD CONSTRAINT "fiscal_nfse_document_timeline_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "fiscal_nfse_document_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_timeline" ADD CONSTRAINT "fiscal_nfse_document_timeline_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_document_attachments" ADD CONSTRAINT "fiscal_nfe_document_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_document_attachments" ADD CONSTRAINT "fiscal_nfe_document_attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "fiscal_nfe_document_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_attachments" ADD CONSTRAINT "fiscal_nfse_document_attachments_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_attachments" ADD CONSTRAINT "fiscal_nfse_document_attachments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "fiscal_nfse_document_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_number_ranges" ADD CONSTRAINT "fiscal_nfe_number_ranges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_number_ranges" ADD CONSTRAINT "fiscal_nfe_number_ranges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_number_ranges" ADD CONSTRAINT "fiscal_nfse_number_ranges_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_number_ranges" ADD CONSTRAINT "fiscal_nfse_number_ranges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_number_range_events" ADD CONSTRAINT "fiscal_nfe_number_range_events_number_range_id_fkey" FOREIGN KEY ("number_range_id") REFERENCES "fiscal_nfe_number_ranges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_number_range_events" ADD CONSTRAINT "fiscal_nfse_number_range_events_number_range_id_fkey" FOREIGN KEY ("number_range_id") REFERENCES "fiscal_nfse_number_ranges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_document_items" ADD CONSTRAINT "fiscal_nfe_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_document_items" ADD CONSTRAINT "fiscal_nfse_document_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_inbound_process" ADD CONSTRAINT "fiscal_nfe_inbound_process_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_inbound_process" ADD CONSTRAINT "fiscal_nfe_inbound_process_portaria_confirmed_by_user_id_fkey" FOREIGN KEY ("portaria_confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_inbound_process" ADD CONSTRAINT "fiscal_nfe_inbound_process_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfse_inbound_process" ADD CONSTRAINT "fiscal_nfse_inbound_process_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_inbound_process" ADD CONSTRAINT "fiscal_nfse_inbound_process_portaria_confirmed_by_user_id_fkey" FOREIGN KEY ("portaria_confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_inbound_process" ADD CONSTRAINT "fiscal_nfse_inbound_process_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fiscal_nfe_sap_documents" ADD CONSTRAINT "fiscal_nfe_sap_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfe_sap_documents" ADD CONSTRAINT "fiscal_nfe_sap_documents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "fiscal_nfe_document_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_sap_documents" ADD CONSTRAINT "fiscal_nfse_sap_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_sap_documents" ADD CONSTRAINT "fiscal_nfse_sap_documents_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "fiscal_nfse_document_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old enums
DROP TYPE "fiscal_document_status";
DROP TYPE "fiscal_document_event_status";
