ALTER TYPE "notification_kind" ADD VALUE 'OPERATIONAL' BEFORE 'QUOTE';--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "recipient_account_id" uuid;--> statement-breakpoint
ALTER TABLE "notification" ALTER COLUMN "recipient_profile_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_account_id_kind_source_id_unique" UNIQUE("recipient_account_id","kind","source_id");--> statement-breakpoint
CREATE INDEX "notification_kind_source_id_id_index" ON "notification" ("kind","source_id","id");--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_account_id_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_check" CHECK (("recipient_profile_id" IS NOT NULL) <> ("recipient_account_id" IS NOT NULL));
