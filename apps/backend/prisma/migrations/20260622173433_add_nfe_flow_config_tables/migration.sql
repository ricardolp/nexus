-- CreateEnum
CREATE TYPE "fiscal_nfe_flow_config_status" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "fiscal_nfe_flow_step_type" AS ENUM ('validation', 'action', 'wait', 'approval');

-- CreateEnum
CREATE TYPE "fiscal_nfe_flow_edge_condition" AS ENUM ('success', 'error', 'wait', 'manual', 'status_ok');

-- CreateEnum
CREATE TYPE "fiscal_nfe_flow_instance_status" AS ENUM ('draft', 'ready', 'processing', 'waiting_gate', 'waiting_approval', 'error', 'blocked', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "fiscal_nfe_flow_step_execution_status" AS ENUM ('pending', 'running', 'success', 'error', 'skipped', 'disabled', 'waiting_external_status');

-- DropForeignKey
ALTER TABLE "fiscal_nfe_documents" DROP CONSTRAINT "fiscal_nfe_documents_company_id_fkey";

-- DropForeignKey
ALTER TABLE "fiscal_nfse_documents" DROP CONSTRAINT "fiscal_nfse_documents_company_id_fkey";

-- AlterTable
ALTER TABLE "fiscal_nfe_document_events" ALTER COLUMN "sequence" DROP DEFAULT;

-- AlterTable
ALTER TABLE "fiscal_nfse_document_events" ALTER COLUMN "sequence" DROP DEFAULT;

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_configs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID,
    "model" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "status" "fiscal_nfe_flow_config_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_flow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_steps" (
    "id" UUID NOT NULL,
    "flow_config_id" UUID NOT NULL,
    "step_key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "type" "fiscal_nfe_flow_step_type" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_flow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_edges" (
    "id" UUID NOT NULL,
    "flow_config_id" UUID NOT NULL,
    "source_step_id" UUID NOT NULL,
    "target_step_id" UUID NOT NULL,
    "condition_type" "fiscal_nfe_flow_edge_condition" NOT NULL,
    "condition_expression" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_flow_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_audit_logs" (
    "id" UUID NOT NULL,
    "flow_config_id" UUID NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "step_key" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_nfe_flow_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_instances" (
    "id" UUID NOT NULL,
    "flow_config_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "model" VARCHAR(20) NOT NULL,
    "status" "fiscal_nfe_flow_instance_status" NOT NULL DEFAULT 'draft',
    "current_step_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fiscal_nfe_flow_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_nfe_flow_step_executions" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "step_key" VARCHAR(64) NOT NULL,
    "status" "fiscal_nfe_flow_step_execution_status" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "payload" JSONB,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_nfe_flow_step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_configs_organization_id_company_id_model_st_idx" ON "fiscal_nfe_flow_configs"("organization_id", "company_id", "model", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_nfe_flow_configs_organization_id_company_id_model_ve_key" ON "fiscal_nfe_flow_configs"("organization_id", "company_id", "model", "version");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_steps_flow_config_id_sequence_idx" ON "fiscal_nfe_flow_steps"("flow_config_id", "sequence");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_edges_flow_config_id_idx" ON "fiscal_nfe_flow_edges"("flow_config_id");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_audit_logs_flow_config_id_created_at_idx" ON "fiscal_nfe_flow_audit_logs"("flow_config_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_instances_document_id_idx" ON "fiscal_nfe_flow_instances"("document_id");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_instances_flow_config_id_status_idx" ON "fiscal_nfe_flow_instances"("flow_config_id", "status");

-- CreateIndex
CREATE INDEX "fiscal_nfe_flow_step_executions_instance_id_step_key_idx" ON "fiscal_nfe_flow_step_executions"("instance_id", "step_key");

-- AddForeignKey
ALTER TABLE "fiscal_nfe_documents" ADD CONSTRAINT "fiscal_nfe_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfse_documents" ADD CONSTRAINT "fiscal_nfse_documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_configs" ADD CONSTRAINT "fiscal_nfe_flow_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_configs" ADD CONSTRAINT "fiscal_nfe_flow_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_configs" ADD CONSTRAINT "fiscal_nfe_flow_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_configs" ADD CONSTRAINT "fiscal_nfe_flow_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_steps" ADD CONSTRAINT "fiscal_nfe_flow_steps_flow_config_id_fkey" FOREIGN KEY ("flow_config_id") REFERENCES "fiscal_nfe_flow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_edges" ADD CONSTRAINT "fiscal_nfe_flow_edges_flow_config_id_fkey" FOREIGN KEY ("flow_config_id") REFERENCES "fiscal_nfe_flow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_edges" ADD CONSTRAINT "fiscal_nfe_flow_edges_source_step_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "fiscal_nfe_flow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_edges" ADD CONSTRAINT "fiscal_nfe_flow_edges_target_step_id_fkey" FOREIGN KEY ("target_step_id") REFERENCES "fiscal_nfe_flow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_audit_logs" ADD CONSTRAINT "fiscal_nfe_flow_audit_logs_flow_config_id_fkey" FOREIGN KEY ("flow_config_id") REFERENCES "fiscal_nfe_flow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_audit_logs" ADD CONSTRAINT "fiscal_nfe_flow_audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_instances" ADD CONSTRAINT "fiscal_nfe_flow_instances_flow_config_id_fkey" FOREIGN KEY ("flow_config_id") REFERENCES "fiscal_nfe_flow_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_instances" ADD CONSTRAINT "fiscal_nfe_flow_instances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_nfe_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_instances" ADD CONSTRAINT "fiscal_nfe_flow_instances_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "fiscal_nfe_flow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_nfe_flow_step_executions" ADD CONSTRAINT "fiscal_nfe_flow_step_executions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "fiscal_nfe_flow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "fiscal_nfe_document_items_document_line_unique" RENAME TO "fiscal_nfe_document_items_document_id_line_number_key";

-- RenameIndex
ALTER INDEX "fiscal_nfe_number_range_events_range_id_created_at_idx" RENAME TO "fiscal_nfe_number_range_events_number_range_id_created_at_idx";

-- RenameIndex
ALTER INDEX "fiscal_nfe_number_ranges_company_id_env_series_idx" RENAME TO "fiscal_nfe_number_ranges_company_id_environment_series_idx";

-- RenameIndex
ALTER INDEX "fiscal_nfe_number_ranges_company_range_unique" RENAME TO "fiscal_nfe_number_ranges_company_id_environment_model_serie_key";

-- RenameIndex
ALTER INDEX "fiscal_nfse_document_items_document_line_unique" RENAME TO "fiscal_nfse_document_items_document_id_line_number_key";

-- RenameIndex
ALTER INDEX "fiscal_nfse_number_range_events_range_id_created_at_idx" RENAME TO "fiscal_nfse_number_range_events_number_range_id_created_at_idx";

-- RenameIndex
ALTER INDEX "fiscal_nfse_number_ranges_company_id_env_series_idx" RENAME TO "fiscal_nfse_number_ranges_company_id_environment_series_idx";

-- RenameIndex
ALTER INDEX "fiscal_nfse_number_ranges_company_range_unique" RENAME TO "fiscal_nfse_number_ranges_company_id_environment_model_seri_key";
