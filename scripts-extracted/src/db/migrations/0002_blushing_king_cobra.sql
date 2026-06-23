CREATE TYPE "public"."email_send_status" AS ENUM('queued', 'processing', 'retrying', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "email_send_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient" varchar(320) NOT NULL,
	"subject" varchar(512) NOT NULL,
	"template" varchar(64) NOT NULL,
	"status" "email_send_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_send_logs_status_created_idx" ON "email_send_logs" USING btree ("status","created_at");