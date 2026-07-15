CREATE TYPE "notification_kind" AS ENUM('FOLLOW');--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY,
	"recipient_profile_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notification_recipient_profile_id_kind_source_id_unique" UNIQUE("recipient_profile_id","kind","source_id")
);
--> statement-breakpoint
CREATE INDEX "notification_recipient_profile_id_id_index" ON "notification" ("recipient_profile_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notification_recipient_profile_id_index" ON "notification" ("recipient_profile_id") WHERE "read_at" IS NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_profile_id_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;
