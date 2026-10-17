DROP INDEX "notification_recipient_profile_id_id_index";
--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "recipient_account_id" SET NOT NULL;