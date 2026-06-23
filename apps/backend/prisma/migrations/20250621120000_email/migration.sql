-- CreateEnum
CREATE TYPE "email_log_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "email_template_type" AS ENUM ('welcome', 'email_confirmation', 'password_reset', 'invite', 'password_changed');

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "template" "email_template_type" NOT NULL,
    "status" "email_log_status" NOT NULL DEFAULT 'pending',
    "erro" TEXT,
    "metadados" JSONB,
    "enviado_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_destinatario_idx" ON "email_logs"("destinatario");

-- CreateIndex
CREATE INDEX "email_logs_template_status_idx" ON "email_logs"("template", "status");
