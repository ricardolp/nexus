CREATE TABLE IF NOT EXISTS "user_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "action" JSONB,
    "category" VARCHAR(64),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_user_id_fkey'
    ) THEN
        ALTER TABLE "user_notifications"
            ADD CONSTRAINT "user_notifications_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "user_notifications_user_id_created_at_idx"
    ON "user_notifications"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "user_notifications_user_id_read_at_idx"
    ON "user_notifications"("user_id", "read_at");
