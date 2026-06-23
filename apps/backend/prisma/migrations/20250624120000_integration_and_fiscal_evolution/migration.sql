-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('pending', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "fiscal_document_status" AS ENUM ('draft', 'emitted', 'authorized', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "fiscal_document_event_status" AS ENUM ('draft', 'authorized', 'rejected');

-- AlterTable fiscal documents
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "company_id" UUID;
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "status" "fiscal_document_status" NOT NULL DEFAULT 'draft';
ALTER TABLE "fiscal_nfe_documents" ADD COLUMN "access_key" TEXT;

ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "company_id" UUID;
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "status" "fiscal_document_status" NOT NULL DEFAULT 'draft';
ALTER TABLE "fiscal_nfse_documents" ADD COLUMN "access_key" TEXT;

ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "event_type" TEXT;
ALTER TABLE "fiscal_nfe_document_events" ADD COLUMN "status" "fiscal_document_event_status" NOT NULL DEFAULT 'draft';

ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "event_type" TEXT;
ALTER TABLE "fiscal_nfse_document_events" ADD COLUMN "status" "fiscal_document_event_status" NOT NULL DEFAULT 'draft';

-- CreateTable integration
CREATE TABLE "integration_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by_user_id" UUID NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "integration_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "secret" TEXT NOT NULL,
    "event_types" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "webhook_endpoint_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "domain_event_outbox" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_tokens_token_hash_key" ON "integration_tokens"("token_hash");
CREATE INDEX "integration_tokens_organization_id_idx" ON "integration_tokens"("organization_id");

CREATE INDEX "webhook_endpoints_organization_id_idx" ON "webhook_endpoints"("organization_id");

CREATE UNIQUE INDEX "webhook_deliveries_idempotency_key_key" ON "webhook_deliveries"("idempotency_key");
CREATE INDEX "webhook_deliveries_webhook_endpoint_id_idx" ON "webhook_deliveries"("webhook_endpoint_id");
CREATE INDEX "webhook_deliveries_organization_id_status_idx" ON "webhook_deliveries"("organization_id", "status");

CREATE INDEX "domain_event_outbox_organization_id_published_at_idx" ON "domain_event_outbox"("organization_id", "published_at");

CREATE INDEX "fiscal_nfe_documents_organization_id_company_id_idx" ON "fiscal_nfe_documents"("organization_id", "company_id");
CREATE INDEX "fiscal_nfse_documents_organization_id_company_id_idx" ON "fiscal_nfse_documents"("organization_id", "company_id");

-- AddForeignKey
ALTER TABLE "fiscal_nfe_documents" ADD CONSTRAINT "fiscal_nfe_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiscal_nfse_documents" ADD CONSTRAINT "fiscal_nfse_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "domain_event_outbox" ADD CONSTRAINT "domain_event_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
