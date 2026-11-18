ALTER TABLE "post_mentions" ADD COLUMN "post_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "post_mentions_post_id_profile_id_unique" ON "post_mentions" ("post_id","profile_id") WHERE "post_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "post_mentions" ADD CONSTRAINT "post_mentions_post_id_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;