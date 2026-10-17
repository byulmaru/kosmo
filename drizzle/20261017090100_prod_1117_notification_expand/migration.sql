ALTER TABLE "post" ADD COLUMN "actor_account_id" uuid CONSTRAINT "post_actor_account_id_account_id_fkey" REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD COLUMN "actor_account_id" uuid CONSTRAINT "profile_follow_request_actor_account_id_account_id_fkey" REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "profile_follow" ADD COLUMN "actor_account_id" uuid CONSTRAINT "profile_follow_actor_account_id_account_id_fkey" REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "reaction" ADD COLUMN "actor_account_id" uuid CONSTRAINT "reaction_actor_account_id_account_id_fkey" REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_account_id_kind_source_id_unique";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_check";