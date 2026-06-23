-- CreateEnum
CREATE TYPE "fiscal_document_direction" AS ENUM ('inbound', 'outbound');

-- CreateTable
CREATE TABLE "fiscal_nfe_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "direction" "fiscal_document_direction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfse_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "direction" "fiscal_document_direction" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfse_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_document_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_document_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfse_document_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfse_document_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_numbering_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_numbering_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfse_numbering_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfse_numbering_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_nfe_documents_organization_id_direction_idx" ON "fiscal_nfe_documents"("organization_id", "direction");

-- CreateIndex
CREATE INDEX "fiscal_nfse_documents_organization_id_direction_idx" ON "fiscal_nfse_documents"("organization_id", "direction");

-- CreateIndex
CREATE INDEX "fiscal_nfe_document_events_organization_id_document_id_idx" ON "fiscal_nfe_document_events"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "fiscal_nfse_document_events_organization_id_document_id_idx" ON "fiscal_nfse_document_events"("organization_id", "document_id");

-- CreateIndex
CREATE INDEX "fiscal_nfe_numbering_events_organization_id_company_id_idx" ON "fiscal_nfe_numbering_events"("organization_id", "company_id");

-- CreateIndex
CREATE INDEX "fiscal_nfse_numbering_events_organization_id_company_id_idx" ON "fiscal_nfse_numbering_events"("organization_id", "company_id");

-- AddForeignKey
ALTER TABLE "fiscal_nfe_documents" ADD CONSTRAINT "fiscal_nfe_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_documents" ADD CONSTRAINT "fiscal_nfse_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_document_events" ADD CONSTRAINT "fiscal_nfe_document_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_document_events" ADD CONSTRAINT "fiscal_nfe_document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_document_events" ADD CONSTRAINT "fiscal_nfse_document_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_document_events" ADD CONSTRAINT "fiscal_nfse_document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfse_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_numbering_events" ADD CONSTRAINT "fiscal_nfe_numbering_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_numbering_events" ADD CONSTRAINT "fiscal_nfe_numbering_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_numbering_events" ADD CONSTRAINT "fiscal_nfse_numbering_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_numbering_events" ADD CONSTRAINT "fiscal_nfse_numbering_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
