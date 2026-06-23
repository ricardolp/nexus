-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "integration_base_url" VARCHAR(2048),
ADD COLUMN "integration_client_id" VARCHAR(255),
ADD COLUMN "integration_secret_key_vault_name" VARCHAR(255),
ADD COLUMN "integration_secret_key_vault_id" TEXT,
ADD COLUMN "sap_client" VARCHAR(3),
ADD COLUMN "sap_language" VARCHAR(5);

-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('sap_cpi');

-- CreateEnum
CREATE TYPE "integration_operation" AS ENUM ('purchase_orders', 'inbound_delivery', 'inbound_miro');

-- CreateTable
CREATE TABLE "integration_request_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "nfe_document_id" UUID,
    "provider" "integration_provider" NOT NULL,
    "operation" "integration_operation" NOT NULL,
    "http_method" VARCHAR(8) NOT NULL,
    "request_url" TEXT NOT NULL,
    "request_body" JSONB,
    "response_body" JSONB,
    "response_status" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "correlation_id" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_request_logs_organization_id_created_at_idx" ON "integration_request_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "integration_request_logs_nfe_document_id_idx" ON "integration_request_logs"("nfe_document_id");

-- CreateIndex
CREATE INDEX "integration_request_logs_organization_id_operation_created_at_idx" ON "integration_request_logs"("organization_id", "operation", "created_at");

-- AddForeignKey
ALTER TABLE "integration_request_logs" ADD CONSTRAINT "integration_request_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
