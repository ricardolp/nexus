-- CreateEnum
CREATE TYPE "organization_company_status" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "organization_companies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "cnpj" TEXT NOT NULL,
    "razao_social" TEXT NOT NULL,
    "status" "organization_company_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "organization_companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_companies_cnpj_key" ON "organization_companies"("cnpj");

-- CreateIndex
CREATE INDEX "organization_companies_organization_id_idx" ON "organization_companies"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_companies" ADD CONSTRAINT "organization_companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
