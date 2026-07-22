ALTER TABLE "post" ADD COLUMN "reply_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_reply_parent_id_post_id_fkey" FOREIGN KEY ("reply_parent_id") REFERENCES "post"("id");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_reply_parent_not_self" CHECK ("reply_parent_id" IS NULL OR "reply_parent_id" <> "id");