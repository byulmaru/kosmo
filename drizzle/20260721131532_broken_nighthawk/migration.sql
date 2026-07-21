ALTER TABLE "post" ADD COLUMN "repost_source_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "post_active_repost_profile_source_unique" ON "post" ("profile_id","repost_source_id") WHERE "state" = 'ACTIVE' AND "current_content_id" IS NULL AND "repost_source_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_repost_source_id_post_id_fkey" FOREIGN KEY ("repost_source_id") REFERENCES "post"("id");
