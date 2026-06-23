-- CreateEnum
CREATE TYPE "organization_company_certificate_status" AS ENUM ('active', 'inactive', 'expired', 'revoked');

-- CreateTable
CREATE TABLE "organization_company_certificates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "status" "organization_company_certificate_status" NOT NULL DEFAULT 'inactive',
    "key_vault_cert_name" TEXT NOT NULL,
    "key_vault_cert_id" TEXT NOT NULL,
    "key_vault_key_id" TEXT,
    "password_secret_name" TEXT,
    "password_secret_id" TEXT,
    "thumbprint" TEXT,
    "subject" TEXT,
    "issuer" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organization_company_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_company_certificates_company_id_idx" ON "organization_company_certificates"("company_id");

-- CreateIndex
CREATE INDEX "organization_company_certificates_organization_id_idx" ON "organization_company_certificates"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_company_certificates_one_active_per_company" ON "organization_company_certificates"("company_id") WHERE "status" = 'active' AND "deleted_at" IS NULL;

-- AddForeignKey
ALTER TABLE "organization_company_certificates" ADD CONSTRAINT "organization_company_certificates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_company_certificates" ADD CONSTRAINT "organization_company_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
