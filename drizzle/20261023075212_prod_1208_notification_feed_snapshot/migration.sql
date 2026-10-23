CREATE TABLE "notification_feed_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"recipient_account_id" uuid NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"items" jsonb NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 minutes' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notification_feed_snapshot_expires_at_index" ON "notification_feed_snapshot" ("expires_at");--> statement-breakpoint
CREATE INDEX "notification_feed_snapshot_recipient_account_id_recipient_profile_id_index" ON "notification_feed_snapshot" ("recipient_account_id","recipient_profile_id");--> statement-breakpoint
ALTER TABLE "notification_feed_snapshot" ADD CONSTRAINT "notification_feed_snapshot_recipient_account_id_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_feed_snapshot" ADD CONSTRAINT "notification_feed_snapshot_recipient_profile_id_profile_id_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;