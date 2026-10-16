ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_account_id_kind_source_id_unique";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_recipient_check";
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "actor_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD COLUMN "actor_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "profile_follow" ADD COLUMN "actor_account_id" uuid;
--> statement-breakpoint
ALTER TABLE "reaction" ADD COLUMN "actor_account_id" uuid;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_account_id_kind_source_id_index" ON "notification" ("recipient_account_id","kind","source_id") WHERE "recipient_profile_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_account_profile_kind_source_unique" ON "notification" ("recipient_account_id","recipient_profile_id","kind","source_id") WHERE "recipient_profile_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "notification_recipient_profile_id_created_at_id_index" ON "notification" ("recipient_profile_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "notification_recipient_account_id_created_at_id_index" ON "notification" ("recipient_account_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_actor_account_id_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "profile_follow_request" ADD CONSTRAINT "profile_follow_request_actor_account_id_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "profile_follow" ADD CONSTRAINT "profile_follow_actor_account_id_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_actor_account_id_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "account"("id") ON DELETE SET NULL;