CREATE TABLE "reaction_notification_group_member" (
	"notification_id" uuid PRIMARY KEY,
	"group_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction_notification_group" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"recipient_account_id" uuid NOT NULL,
	"recipient_profile_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"anchor_notification_id" uuid NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE INDEX "reaction_notification_group_member_group_id_index" ON "reaction_notification_group_member" ("group_id");--> statement-breakpoint
CREATE INDEX "reaction_notification_group_recipient_account_id_recipient_profile_id_post_id_started_at_index" ON "reaction_notification_group" ("recipient_account_id","recipient_profile_id","post_id","started_at");--> statement-breakpoint
ALTER TABLE "reaction_notification_group_member" ADD CONSTRAINT "reaction_notification_group_member_gl4vQK5WpotW_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction_notification_group_member" ADD CONSTRAINT "reaction_notification_group_member_LeKc6KKt0VFA_fkey" FOREIGN KEY ("group_id") REFERENCES "reaction_notification_group"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction_notification_group" ADD CONSTRAINT "reaction_notification_group_YX9AYTdcGtFZ_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "account"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction_notification_group" ADD CONSTRAINT "reaction_notification_group_zgFV3DTKSIYv_fkey" FOREIGN KEY ("recipient_profile_id") REFERENCES "profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction_notification_group" ADD CONSTRAINT "reaction_notification_group_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;