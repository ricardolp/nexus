-- CreateTable
CREATE TABLE "organization_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "max_companies" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organization_id_key" ON "organization_settings"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill settings for existing organizations
INSERT INTO "organization_settings" ("id", "organization_id", "max_companies", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organizations"
WHERE "deleted_at" IS NULL
  AND "id" NOT IN (SELECT "organization_id" FROM "organization_settings");
